const assert = require('assert').strict;
const {waitFor, waitForPass} = require('../src/assert_utils');

async function run() {
    // waitFor
    await assert.rejects(waitFor(() => false, {timeout: 10, checkEvery: 1, message: 'Never changed'}), {
        message: 'Never changed (waited 10ms)',
    });

    await assert.rejects(waitFor(() => false, {timeout: 10, checkEvery: 1}), {
        message: 'assertEventually failed (waited 10ms)',
    });

    await assert.rejects(waitFor(() => {throw new Error('crash');}), {
        message: 'crash',
    });

    // Should pass
    await waitFor(() => true);

    // waitForPass
    await assert.doesNotReject(waitForPass(() => false, {timeout: 10, checkEvery: 1, message: 'Never changed'}), {
        message: 'Never changed (waited 10ms)',
    });

    let counter = 0;
    await waitForPass(() => {
        counter++;
        if (counter < 3) {
            throw new Error('crash');
        }
    }, {checkEvery: 1});
    assert.strictEqual(counter, 3);

    // Should pass
    await waitForPass(() => true);
}

module.exports = {
    description: 'Wait that a condition passes',
    run,
};
