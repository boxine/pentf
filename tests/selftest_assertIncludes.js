const assert = require('assert').strict;

const {assertIncludes} = require('../assert_utils');

async function run() {
    assertIncludes('& foobar', 'foo');
    assertIncludes([9, 5, 4], 5);

    assert.throws(
        () => assertIncludes('haystack', 'foo'),
        {message: 'Expected "haystack" to include "foo".'});
    assert.throws(
        () => assertIncludes([2, 3], 4, 'missing'),
        {message: 'Expected [2,3] to include 4. missing'});
    assert.throws(
        () => assertIncludes(42, 'foo', 'message not output because of internal error'),
        {message: 'Haystack object 42 does not have an includes method'});

}

module.exports = {
    description: 'assert_utils.assertIncludes',
    run,
    resources: [],
};
