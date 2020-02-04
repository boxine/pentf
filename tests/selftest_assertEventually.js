const assert = require('assert');

const {assertEventually} = require('../utils');

async function run() {
    await assert.rejects(assertEventually(() => false, 'Never changed', {timeout: 10, checkEvery: 1}), {
        message: 'Never changed (waited 10ms)',
    });

    let counter = 0;
    await assertEventually(() => {
        return counter++ > 2;
    }, 'succeeds eventually', {checkEvery: 1});

}

module.exports = {
    description: 'Assertion that a synchronous method returns true within a limited timeframe',
    resources: [],
    run,
};
