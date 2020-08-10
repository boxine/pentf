const assert = require('assert').strict;

/**
 * Get tests result summary data
 * @param {import('./config').Config} config
 * @param {import('./runner').Task[]} tasks
 * @param {boolean} onTests
 * @private
 */
function getResults(config, tasks, onTests=false) {
    const expectNothing = config.expect_nothing;
    assert(Array.isArray(tasks));

    const success = tasks.filter(t => t.status === 'success' && (!t.expectedToFail || expectNothing));
    const errored = tasks.filter(
        t => t.status === 'error' && (!t.expectedToFail || expectNothing));
    const flaky = tasks.filter(t => t.status === 'flaky');
    const skipped = tasks.filter(t => t.status === 'skipped');
    const expectedToFail = !expectNothing && tasks.filter(
        t => t.expectedToFail && t.status === 'error');
    const expectedToFailButPassed = !expectNothing && tasks.filter(
        t => t.expectedToFail && t.status === 'success');
    const running = tasks.filter(t => t.status === 'running');
    const done = tasks.filter(t => (t.status === 'success') || (t.status === 'error'));
    const todo = tasks.filter(t => t.status === 'todo');

    const itemName = (onTests || ((config.repeat || 1) === 1)) ? 'tests' : 'tasks';

    return {
        success,
        errored,
        flaky,
        skipped,
        expectedToFail,
        expectedToFailButPassed,
        itemName,
        running,
        done,
        todo,
    };
}

/**
* Summarize test results for PDF.
* @hidden
* @param {*} config The pentf configuration object.
* @param {Array<Object>} tasks All finished tasks.
* @param {boolean} onTests Summarize tests instead of tasks.
* @returns {string} A string with counts of the results.
**/
function resultCountString(config, tasks, onTests=false) {
    const {
        success,
        errored,
        flaky,
        skipped,
        expectedToFail,
        expectedToFailButPassed,
        itemName
    } = getResults(config, tasks, onTests);

    let res = `${success.length} ${itemName} passed, ${errored.length} failed`;
    if (flaky.length) {
        res += `, ${flaky.length} flaky`;
    }
    if (skipped.length) {
        res += `, ${skipped.length} skipped`;
    }
    if (expectedToFail.length) {
        res += `, ${expectedToFail.length} failed as expected`;
    }
    if (expectedToFailButPassed.length) {
        res += `, ${expectedToFailButPassed.length} were expected to fail but passed`;
    }
    return res;
}

module.exports = {
    getResults,
    resultCountString
};
