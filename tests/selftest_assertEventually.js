const assert = require('assert').strict;

const {assertEventually} = require('../src/assert_utils');

async function run() {
    await assert.rejects(assertEventually(() => false, {timeout: 10, checkEvery: 1, message: 'Never changed'}), {
        message: 'Never changed (waited 10ms)',
    });

    await assert.rejects(assertEventually(() => false, {timeout: 10, checkEvery: 1}), {
        message: 'assertEventually failed (waited 10ms)',
    });

    let counter = 0;
    await assertEventually(() => {
        return counter++ > 2;
    }, {checkEvery: 1});

    await assert.rejects(assertEventually(() => {throw new Error('crash');}), {
        message: 'crash',
    });

    counter = 0;
    await assertEventually(() => {
        counter++;
        if (counter < 3) {
            throw new Error('crash');
        }
    }, {checkEvery: 1, crashOnError: false});
    assert.strictEqual(counter, 3);

    // Throws original error
    try {
        await assertEventually(() => {
            throw new Error('Custom error');
        }, {crashOnError: false, timeout: 1000 });
        throw new Error('fail');
    } catch (err) {
        assert.match(err.message, /Custom error/);
    }

    let counter2 = 0;
    await assertEventually(() => {
        counter2++;
        if (counter2 < 3) {
            throw new Error('Custom error');
        }
    }, {crashOnError: false, timeout: 1000 });
    assert.equal(counter2, 3);
}

module.exports = {
    description: 'Assertion that a synchronous method returns true within a limited timeframe',
    resources: [],
    run,
};
