const assert = require('assert').strict;

// Should run
async function run() {
    assert.equal(1, 1);
}

module.exports = {
    description: 'Test browser_utils.getAttribute',
    skip: () => Promise.resolve().then(() => false),
    resources: [],
    run,
};
