import { strict as assert } from 'assert';
import { Config } from './config';
import { TestResult } from './render';

/**
 * Get tests result summary data
 * @private
 */
export function getResults(config: Config, results: TestResult[]) {
    const expectNothing = config.expect_nothing;
    assert(Array.isArray(results));

    const success = results.filter(t => t.status === 'success' && (!t.expectedToFail || expectNothing));
    const errored = results.filter(
        t => t.status === 'error' && (!t.expectedToFail || expectNothing));
    const flaky = results.filter(t => t.status === 'flaky');
    const skipped = results.filter(t => t.status === 'skipped');
    const expectedToFail = !expectNothing && results.filter(
        t => t.expectedToFail && t.status === 'error') || [];
    const expectedToFailButPassed = !expectNothing && results.filter(
        t => t.expectedToFail && t.status === 'success') || [];
    const todo = results.filter(t => t.status === 'todo');

    return {
        success,
        errored,
        flaky,
        skipped,
        expectedToFail,
        expectedToFailButPassed,
        todo,
    };
}

export type Results = ReturnType<typeof getResults>;

/**
* Summarize test results for PDF.
* @hidden
* @param {*} config The pentf configuration object.
* @param {import('./render').TestResult[]} tests All finished tests.
* @returns {string} A string with counts of the results.
**/
export function resultCountString(config: Config, tests: TestResult[]) {
    const {
        success,
        errored,
        flaky,
        skipped,
        expectedToFail,
        expectedToFailButPassed,
    } = getResults(config, tests);

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
