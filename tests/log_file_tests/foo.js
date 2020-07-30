const assert = require('assert').strict;

async function run() {
    assert.equal(1, 1);
}

module.exports = {
    description: 'Test browser_utils.getAttribute',
    resources: ['A', 'B'],
    run,
};
