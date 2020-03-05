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

module.exports = {
    catchLater,
    customErrorMessage,
};
