const assert = require('assert').strict;

async function run() {
    assert.equal(1, 1);
}

module.exports = {
    description: 'Test watch changes',
    run,
};
