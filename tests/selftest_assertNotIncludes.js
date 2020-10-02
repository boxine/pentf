const assert = require('assert').strict;

const {assertNotIncludes} = require('../src/assert_utils');

async function run() {
    assertNotIncludes('haystack', 'foo');
    assertNotIncludes([9, 5, 4], 3);

    assert.throws(
        () => assertNotIncludes('foobar', 'foo'),
        {message: 'Expected "foobar" to not include "foo".'});
    assert.throws(
        () => assertNotIncludes([4, 3], 4, 'but is present'),
        {message: 'Expected [4,3] to not include 4. but is present'});
    assert.throws(
        () => assertNotIncludes(42, 'foo', 'message not output because of internal error'),
        {message: 'Haystack object 42 does not have an includes method'});
}

module.exports = {
    description: 'assert_utils.assertNotIncludes',
    run,
    resources: [],
};
