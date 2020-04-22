const assert = require('assert').strict;

const {resultCountString} = require('../results');

async function run() {
    const simple = [
        {status: 'success'},
        {status: 'success'},
        {status: 'success'},
        {status: 'skipped'},
        {status: 'error'},
        {status: 'error'},
    ];
    assert.strictEqual(
        resultCountString(simple), '3 tests passed, 2 failed, 1 skipped');

    const everythingOnce = [
        {status: 'success'},
        {status: 'skipped'},
        {status: 'skipped', expectedToFail: 'should count as skipped'},
        {status: 'error'},
        {status: 'error', expectedToFail: 'expected error'},
        {status: 'success', expectedToFail: 'expected error but passed'},
    ];
    assert.strictEqual(
        resultCountString(everythingOnce),
        '1 tests passed, 1 failed, 2 skipped, 1 failed as expected, 1 were expected to fail but passed');
}

module.exports = {
    description: 'Testing pentf itself: counting and classifying test results',
    run,
};
