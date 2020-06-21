/**
 * Reconstruct original types from serialized message
 * @param {*} value
 */
function parseConsoleArg(value) {
    if (Array.isArray(value)) {
        return value.map(item => parseConsoleArg(item));
    } else if (typeof value === 'object') {
        if (value.__pentf_serialized) {
            if (value.type === 'null') {
                return null;
            } else if (value.type === 'undefined') {
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
async function patchBrowserConsole(page) {
    await page.evaluate(() => {
        const seen = new Set();

        function serialize(value) {
            if (seen.has(value)) {
                return '[[Circular]]';
            }

            if (Array.isArray(value)) {
                seen.add(value);
                return value.map(x => serialize(x));
            } else if (value === undefined) {
                return {
                    __pentf_serialized: true,
                    type: 'undefined',
                };
            } else if (typeof value === 'object') {
                if (value === null) {
                    return {
                        __pentf_serialized: true,
                        type: 'null',
                    };
                } else if (value instanceof Error) {
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
                        items: Array.from(value).map(item => serialize(item)),
                    };
                } else if (value instanceof Map) {
                    return {
                        __pentf_serialized: true,
                        type: 'Map',
                        items: Array.from(value.entries()).map(entry => {
                            return [serialize(entry[0]), serialize(entry[1])];
                        }),
                    };
                }

                seen.add(value);
                let out = {};
                Object.keys(value).forEach(key => {
                    out[key] = serialize(value[key]);
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

        const native = {};
        for (const key in console) {
            native[key] = console[key];
            console[key] = (...args) => {
                if (key === 'trace') {
                    const stack = new Error().stack.split('\n').slice(2).join('\n');
                    args = ['\n' + stack, ...args];
                }
                native[key].call(null, JSON.stringify(args.map(arg => serialize(arg))));
            };
        }
    });
}

module.exports = {
    parseConsoleArg,
    patchBrowserConsole,
};
