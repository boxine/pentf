/**
 * Reconstruct original types from serialized message
 * @param {*} value
 */
function parseConsoleArg(value) {
    if (Array.isArray(value)) {
        return value.map(item => parseConsoleArg(item));
    } else if (typeof value === 'object' && value !== null) {
        if (value.__pentf_serialized) {
            if (value.type === 'undefined') {
                return undefined;
            } else if (value.type === 'Error') {
                const err = new Error(value.message);
                err.stack = value.stack;
                return err;
            } else if (value.type === 'Set') {
                return new Set(value.items.map(item => parseConsoleArg(item)));
            } else if (value.type === 'Map') {
                return new Map(
                    value.items.map(item => {
                        return [parseConsoleArg(item[0]), parseConsoleArg(item[1])];
                    })
                );
            } else if (value.type === 'Function') {
                // Mirror node output format
                return !value.name ? '[Function (anonymous)]' : `[Function: ${value.name}]`;
            }
        }

        let out = {};
        for (const key in value) {
            out[key] = parseConsoleArg(value[key]);
        }
        return out;
    }

    return value;
}

/**
 * Serialize any JS value to JSON. Used to send data from the browser
 * to the node process.
 * @param {*} value
 * @param {Set<any>} seen
 */
function serialize(value, seen) {
    if (seen.has(value)) {
        return '[[Circular]]';
    }

    if (Array.isArray(value)) {
        seen.add(value);
        return value.map(x => serialize(x, seen));
    } else if (value === undefined) {
        return {
            __pentf_serialized: true,
            type: 'undefined',
        };
    } else if (value === null) {
        return null;
    } else if (typeof value === 'object') {
        seen.add(value);

        if (value instanceof Error) {
            // TODO: check fur custom keys
            return {
                __pentf_serialized: true,
                type: 'Error',
                message: value.message,
                stack: value.stack,
            };
        } else if (value instanceof Set) {
            return {
                __pentf_serialized: true,
                type: 'Set',
                items: Array.from(value).map(item => serialize(item, seen)),
            };
        } else if (value instanceof Map) {
            return {
                __pentf_serialized: true,
                type: 'Map',
                items: Array.from(value.entries()).map(entry => {
                    return [serialize(entry[0], seen), serialize(entry[1], seen)];
                }),
            };
        }

        let out = {};
        Object.keys(value).forEach(key => {
            out[key] = serialize(value[key], seen);
        });

        return out;
    } else if (typeof value === 'function') {
        return {
            __pentf_serialized: true,
            type: 'Function',
            name: value.name,
        };
    }

    return value;
}

/**
 * Serialize console arguments and send them to puppeteer. Unfortunately for
 * us the native serialization methods for JSHandle objects from puppeteer
 * are lossy. They turn Error objects into `{}` and `null` to `undefined`.
 * The passed "preview" object is incomplete and truncates all data for nested
 * objects or other complex values.
 *
 * The only way to keep the data intact is to use a custom serialization format
 * and pass it around as a string.
 *
 * @param {import('puppeteer').Page} page
 */
async function forwardBrowserConsole(page) {
    // The stack is not present on the trace method, so we need to patch it in
    await page.evaluateOnNewDocument((fn) => {
        const serialize = new Function(`return ${fn}`)();
        const native = {};
        native.trace = console.trace;
        console.trace = (...args) => {
            const stack = new Error().stack.split('\n').slice(2).join('\n');
            args = ['\n' + stack, ...args];
            native.trace.apply(null, args.map(arg => serialize(arg, new Set())));
        };
    }, serialize.toString());

    page.on('console', async message => {
        let resolve;
        page._logs.push(new Promise(r => resolve = r));

        let type = message.type();
        // Correct log type for warning messages
        type = type === 'warning' ? 'warn' : type;

        try {
            const args = await Promise.all(
                message.args().map(arg => {
                    return arg.executionContext().evaluate((handle, fn) => {
                        const serialize = new Function(`return ${fn}`)();
                        return serialize(handle, new Set());
                    }, arg, serialize.toString());
                })
            );

            const parsed = args.map(arg => parseConsoleArg(arg));
            if (type === 'trace') {
                console.log(`Trace: ${parsed[1] || ''}${parsed[0]}`);
            } else {
                console[type].apply(console, parsed);
            }
        } catch (err) {
            console.log(err);
        } finally {
            resolve();
        }
    });
}

module.exports = {
    parseConsoleArg,
    forwardBrowserConsole,
};
