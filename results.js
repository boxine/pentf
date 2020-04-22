const utils = require('./utils');

/**
* Summarize test results.
* @hidden
* @returns {string} A string with counts of the results.
**/
function resultCountString(tasks) {
    const success = utils.count(tasks, t => t.status === 'success' && !t.expectedToFail);
    const errored = utils.count(tasks, t => t.status === 'error' && !t.expectedToFail);
    const skipped = utils.count(tasks, t => t.status === 'skipped');
    const expectedToFail = utils.count(
        tasks, t => t.expectedToFail && t.status === 'error');
    const expectedToFailButPassed = utils.count(
        tasks, t => t.expectedToFail && t.status === 'success');

    let res = `${success} tests passed, ${errored} failed`;
    if (skipped) {
        res += `, ${skipped} skipped`;
    }
    if (expectedToFail) {
        res += `, ${expectedToFail} failed as expected`;
    }
    if (expectedToFailButPassed) {
        res += `, ${expectedToFailButPassed} were expected to fail but passed`;
    }
    return res;
}

module.exports = {
    resultCountString,
};
