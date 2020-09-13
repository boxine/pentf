const assert = require('assert').strict;
const { wait } = require('../../src/utils');

async function run() {
    await wait(1000);
    assert.equal(1, 1);
}

module.exports = {
    description: 'Test slow watch changes',
    run,
};
