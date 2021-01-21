const assert = require('assert').strict;

const output = require('./output');

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
function catchLater(promise) {
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
async function customErrorMessage(promise, message) {
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
async function expectedToFail(config, message, asyncFunc, {expectNothing=false} = {}) {
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
        err.pentf_expectedToSucceed = message;
        throw err;
    }
}

/**
 * Raise an error if a promise does not finish within a certain timeframe.
 * Note this does not cancel the promise itself (because that's impossible).
 *
 * @param {*} config The pentf configuration.
 * @param {Promise} promise The promise to limit
 * @param {{expectNothing?: boolean, timeout?: number, warning?: number, message?: string}} __namedParameters Options (currently not visible in output due to typedoc bug)
 * @param {number} timeout Timeout in ms (by default 10000=10s)
 * @param {string} message Optional error message to show when the timeout fires.
 * @param {boolean} warning Only print an error message, do not throw.
 * @returns {*} Whatever the promise returned, if it is successful
 */
async function timeoutPromise(config, promise, {timeout=10000, message=undefined, warning=false} = {}) {
    const stacktraceAr = (new Error()).stack.split('\n', 3);
    const stacktrace = stacktraceAr[stacktraceAr.length - 1];

    let resolved = false;
    try {
        return await Promise.race([
            promise,
            new Promise((resolve, reject) => setTimeout(() => {
                let wholeMessage = (
                    `Promise did not finish within ${timeout}ms` + (message ? '. ' + message : ''));
                if (warning) {
                    if (resolved) {
                        return; // Main promise done already
                    }
                    wholeMessage = `WARNING: ${wholeMessage}\n${stacktrace}`;
                    output.log(config, wholeMessage);
                    resolve();
                } else {
                    reject(new Error(wholeMessage));
                }
            }, timeout))
        ]);
    } finally {
        resolved = true;
    }
}

module.exports = {
    catchLater,
    customErrorMessage,
    expectedToFail,
    timeoutPromise,
};
