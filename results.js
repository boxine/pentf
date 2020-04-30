const assert = require('assert').strict;

const utils = require('./utils');

/**
* Summarize test results.
* @hidden
* @param {*} config The pentf configuration object.
* @param {Array<Object>} tasks All finished tasks.
* @returns {string} A string with counts of the results.
**/
function resultCountString(config, tasks) {
    const expectNothing = config.expect_nothing;
    assert(Array.isArray(tasks));

    const success = utils.count(
        tasks, t => t.status === 'success' && (!t.expectedToFail || expectNothing));
    const errored = utils.count(
        tasks, t => t.status === 'error' && (!t.expectedToFail || expectNothing));
    const skipped = utils.count(tasks, t => t.status === 'skipped');
    const expectedToFail = !expectNothing && utils.count(
        tasks, t => t.expectedToFail && t.status === 'error');
    const expectedToFailButPassed = !expectNothing && utils.count(
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
