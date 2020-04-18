const assert = require('assert');

/**
 * Avoid UnhandledPromiseRejectionWarning if a promise fails before we use it.
 * Use like this:
 * const email_promise = catchLater(getMail(...));
 * await ...
 * const email = await email_promise;
 * @param {Promise<any>} promise 
 */
function catchLater(promise) {
    promise.catch(() => undefined);
    return promise;
}

/**
 * await and emit a custom message if it fails
 * @param {Promise<any>} promise 
 * @param {string} error_message 
 */
async function customErrorMessage(promise, error_message) {
    try {
        return await promise;
    } catch (e) {
        e.message += ' (' + error_message + ')';
        if (! e.stack.includes(error_message)) {
            // Some exception classes generate the stack automatically
            const newline_index = e.stack.indexOf('\n');
            if (newline_index >= 0) {
                e.stack = e.stack.slice(0, newline_index) + ' (' + error_message + ')' + e.stack.slice(newline_index);
            }
        }
        throw e;
    }
}

/**
 * Mark a code section as expected to fail.
 * @param {*} config The pentf configuration.
 * @param {string} message Error message to show when the section fails (recommended: ticket URL)
 * @param {() => any} asyncFunc The asynchronous section which is part of the test.
 * @param {{expectNothing?: boolean}} [options]
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

module.exports = {
    catchLater,
    customErrorMessage,
    expectedToFail,
};
