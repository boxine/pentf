const assert = require('assert').strict;

/**
 * Get tests result summary data
 * @param {import('./config').Config} config
 * @param {import('./internal').TestResult[]} results
 * @private
 */
function getResults(config, results) {
    const expectNothing = config.expect_nothing;
    assert(Array.isArray(results));

    const success = results.filter(
        t => t.status === 'success' && (!t.expectedToFail || expectNothing)
    );
    const errored = results.filter(
        t => t.status === 'error' && (!t.expectedToFail || expectNothing)
    );
    const flaky = results.filter(t => t.status === 'flaky');
    const skipped = results.filter(t => t.status === 'skipped');
    const expectedToFail =
        !expectNothing && results.filter(t => t.expectedToFail && t.status === 'error');
    const expectedToFailButPassed =
        !expectNothing && results.filter(t => t.expectedToFail && t.status === 'success');
    const todo = results.filter(t => t.status === 'todo');
    const running = results.filter(t => t.status === 'running');

    return {
        success,
        errored,
        flaky,
        skipped,
        expectedToFail,
        expectedToFailButPassed,
        todo,
        running,
        all: results,
    };
}

/**
 * Summarize test results for PDF.
 * @hidden
 * @param {*} config The pentf configuration object.
 * @param {import('./internal').TestResult[]} tests All finished tests.
 * @returns {string} A string with counts of the results.
 **/
function resultCountString(config, tests) {
    const {success, errored, flaky, skipped, expectedToFail, expectedToFailButPassed} = getResults(
        config,
        tests
    );

    let res = `${success.length} tests passed, ${errored.length} failed`;
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
    resultCountString,
};
