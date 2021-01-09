import * as output from './output';
import * as kolorist from 'kolorist';
import { Config } from './config';
import { ConsoleMessage, Page } from 'puppeteer';

/**
 * Reconstruct original types from serialized message
 * @param {*} value
 */
export function parseConsoleArg(value: any) {
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
function serialize(value: any, seen: Set<any>) {
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
 * @param {import('./config').Config} config
 * @param {string} type
 * @param {import('puppeteer').ConsoleMessage} message
 * @private
 */
function printRawMessage(config: Config, type: string, message: ConsoleMessage) {
    const loc = message.location();
    let url = loc.url;
    if (loc.lineNumber) {
        url += `:${loc.lineNumber}`;
        if (loc.columnNumber) {
            url += `:${loc.columnNumber}`;
        }
    }
    url = kolorist.link(url, url);

    const colors = {
        warn: 'yellow',
        error: 'red',
    };

    const locStr = output.color(config, 'dim', `  at ${url}`);
    let text = `${message.text()}\n${locStr}`;
    if (colors[type]) {
        text = output.color(config, colors[type], text);
    }

    output.log(config, text);
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
 */
export async function forwardBrowserConsole(config: Config, page: Page) {
    // The stack is not present on the trace method, so we need to patch it in
    await page.evaluateOnNewDocument((fn) => {
        const serialize = new Function(`return ${fn}`)();
        const native: any = {};
        native.trace = console.trace;
        console.trace = (...args) => {
            const stack = new Error().stack.split('\n').slice(2).join('\n');
            args = ['\n' + stack, ...args];
            native.trace.apply(null, args.map(arg => serialize(arg, new Set())));
        };
    }, serialize.toString());

    const browser = page.browser() as any;
    page.on('console', async message => {
        let resolve;
        browser._logs.push(new Promise(r => resolve = r));

        let type = message.type();
        // Correct log type
        const typeMap = {
            warning: 'warn',
            verbose: 'log'
        };
        type = typeMap[type] || type;

        if (!message.args().length) {
            printRawMessage(config, type, message);
            resolve();
            return;
        }

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
            // While we're serializing data, the user or something else might
            // trigger a navigation. In this case our context will be destroyed.
            // When this happens we fall back to the raw string value that
            // puppeteer sent us initially.
            if (/Execution context was destroyed/.test(err.message)) {
                printRawMessage(config, type, message);
            } else {
                console.log(err);
            }
        } finally {
            resolve();
        }
    });
}

