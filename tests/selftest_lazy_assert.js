const assert = require('assert').strict;

const {lazyAssert} = require('../src/assert_utils');

async function run() {
    let executed = false;
    lazyAssert(true, () => {executed = true; return 'executed';});
    assert(!executed);
    assert.throws(
        () => lazyAssert(false, () => {executed = true; return 'generated';}),
        {message: 'generated'});
    assert(executed);
}

module.exports = {
    description: 'assert_utils.lazyAssert helper function',
    run,
    resources: [],
};
