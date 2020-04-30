const assert = require('assert');

const {assertEventually} = require('../utils');

async function run() {
    await assert.rejects(
        assertEventually(() => false, {timeout: 10, checkEvery: 1, message: 'Never changed'}),
        {
            message: 'Never changed (waited 10ms)',
        }
    );

    await assert.rejects(
        assertEventually(() => false, {timeout: 10, checkEvery: 1}),
        {
            message: 'assertEventually failed (waited 10ms)',
        }
    );

    let counter = 0;
    await assertEventually(
        () => {
            return counter++ > 2;
        },
        {checkEvery: 1}
    );

    await assert.rejects(
        assertEventually(() => {
            throw new Error('crash');
        }),
        {
            message: 'crash',
        }
    );

    counter = 0;
    await assertEventually(
        () => {
            counter++;
            if (counter < 3) {
                throw new Error('crash');
            }
        },
        {checkEvery: 1, crashOnError: false}
    );
    assert.strictEqual(counter, 3);
}

module.exports = {
    description: 'Assertion that a synchronous method returns true within a limited timeframe',
    resources: [],
    run,
};
