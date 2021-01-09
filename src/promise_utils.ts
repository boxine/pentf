import { strict as assert } from 'assert';
import { Config } from './config';
import * as output from './output';

/**
 * Avoid `UnhandledPromiseRejectionWarning` if a promise fails before we `await` it.
 * @example
 * ```javascript
 * const emailPromise = catchLater(getMail(...));
 * await ...
 * const email = await emailPromise;
 * ```
 * @param {Promise<any>} promise A promise to ignore for now (will be caught later)
 */
export function catchLater<T>(promise: Promise<T>) {
    promise.catch(() => undefined);
    return promise;
}

/**
 * Attach a custom error message if a promise fails.
 * If the promise succeeds, this function does nothing.
 *
 * @example
 * ```javascript
 * const page = newPage(config);
 * await page.goto('https://example.org/');
 * await customErrorMessage(
 *     page.waitForSelector('blink'), '<blink> element not found (BUG-123)');
 * await closePage(page);
 * ```
 * @param {Promise<any>} promise The promise to wait for.
 * @param {string} message Custom message to attach to the error;
 */
export async function customErrorMessage<T>(promise: Promise<T>, message: string) {
    try {
        return await promise;
    } catch (e) {
        e.message += ' (' + message + ')';
        if (! e.stack.includes(message)) {
            // Some exception classes generate the stack automatically
            const newline_index = e.stack.indexOf('\n');
            if (newline_index >= 0) {
                e.stack = e.stack.slice(0, newline_index) + ' (' + message + ')' + e.stack.slice(newline_index);
            }
        }
        throw e;
    }
}

/**
 * Mark a code section as expected to fail.
 * If the async function throws an error, the error will be included in reports, but not counted as a test failure.
 * If the async function succeeds, a warning will be printed.
 *
 * @example
 * ```
 * await expectedToFail(config, 'BUG-1234', async() => {
 *     ...
 * }, {
 *     expectNothing: config.env === 'very-good-environment',
 * });
 * ```
 * @param {*} config The pentf configuration.
 * @param {string} message Error message to show when the section fails (recommended: ticket URL)
 * @param {() => any} asyncFunc The asynchronous section which is part of the test.
 * @param {{expectNothing?: boolean}} __namedParameters Options (currently not visible in output due to typedoc bug)
 * @param {boolean} expectNothing Do nothing – this is convenient if the code is expected to work on some environments. (default: false)
 */
export async function expectedToFail(config: Config, message: string, asyncFunc: () => any, {expectNothing=false} = {}) {
    assert(message);
    assert(asyncFunc);

    if (expectNothing) {
        // On this environment, we expect everything to work just fine
        await asyncFunc();
        return;
    }

    try {
        await asyncFunc();
    } catch(e) {
        e.pentf_expectedToFail = message;
        throw e;
    }
    if (!config.expect_nothing) {
        const err = new Error(
            `Section marked as expectedToFail (${message}), but succeeded.` +
            ' Pass in --expect-nothing/-E to ignore this message');
        (err as any).pentf_expectedToSucceed = message;
        throw err;
    }
}

export interface TimeoutPromiseOptions {
    /** Timeout in ms (by default 10000=10s) */
    timeout?: number;
    /** Optional error message to show when the timeout fires. */
    message?: string;
    /** Only print an error message, do not throw. */
    warning?: boolean;
}

/**
 * Raise an error if a promise does not finish within a certain timeframe.
 * Note this does not cancel the promise itself (because that's impossible).
 *
 * @param {*} config The pentf configuration.
 * @param {Promise} promise The promise to limit
 * @param {{expectNothing?: boolean, timeout?: number, warning?: number}} __namedParameters Options (currently not visible in output due to typedoc bug)

 * @returns {*} Whatever the promise returned, if it is successful
 */
export async function timeoutPromise<T>(config: Config, promise: Promise<T>, {timeout=10000, message, warning=false}: TimeoutPromiseOptions = {}) {
    const stacktraceAr = (new Error()).stack!.split('\n', 3);
    const stacktrace = stacktraceAr[stacktraceAr.length - 1];

    let resolved = false;
    try {
        return await Promise.race([
            promise,
            new Promise<undefined>((resolve, reject) => setTimeout(() => {
                let wholeMessage = (
                    `Promise did not finish within ${timeout}ms` + (message ? '. ' + message : ''));
                if (warning) {
                    if (resolved) {
                        return; // Main promise done already
                    }
                    wholeMessage = `WARNING: ${wholeMessage}\n${stacktrace}`;
                    output.log(config, wholeMessage);
                    resolve(undefined);
                } else {
                    reject(new Error(wholeMessage));
                }
            }, timeout))
        ]);
    } finally {
        resolved = true;
    }
}
