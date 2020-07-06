const assert = require('assert').strict;

const utils = require('./utils');

/**
 * Get tests result summary data
 * @param {*} config 
 * @param {object[]} tasks 
 * @param {boolean} onTests 
 */
function getResults(config, tasks, onTests=false) {
    const expectNothing = config.expect_nothing;
    assert(Array.isArray(tasks));

    const success = utils.count(
        tasks, t => t.status === 'success' && (!t.expectedToFail || expectNothing));
    const errored = utils.count(
        tasks, t => t.status === 'error' && (!t.expectedToFail || expectNothing));
    const flaky = utils.count(tasks, t => t.status === 'flaky');
    const skipped = utils.count(tasks, t => t.status === 'skipped');
    const expectedToFail = !expectNothing && utils.count(
        tasks, t => t.expectedToFail && t.status === 'error');
    const expectedToFailButPassed = !expectNothing && utils.count(
        tasks, t => t.expectedToFail && t.status === 'success');
    
    const itemName = (onTests || ((config.repeat || 1) === 1)) ? 'tests' : 'tasks';

    return {
        success,
        errored,
        flaky,
        skipped,
        expectedToFail,
        expectedToFailButPassed,
        itemName,
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
        expectedToFailButPassed
    } = getResults(config, tasks, onTests);

    const itemName = (onTests || ((config.repeat || 1) === 1)) ? 'tests' : 'tasks';
    let res = `${success} ${itemName} passed, ${errored} failed`;
    if (flaky) {
        res += `, ${flaky} flaky`;
    }
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
    getResults,
    resultCountString
};
