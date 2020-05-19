const assert = require('assert').strict;

const {
    assertGreater,
    assertGreaterEqual,
    assertLess,
    assertLessEqual,
    assertNumeric,
} = require('../assert_utils');

async function run() {
    assertNumeric(42n);
    assertNumeric(.2e7);

    assertGreater(2, 1);
    assert.throws(() => assertGreater('a', 2));
    assert.throws(() => assertGreater(2, ['2']));
    assert.throws(() => assertGreater(NaN, 2));
    assert.throws(() => assertGreater(2, NaN));
    assert.throws(
        () => assertGreater(1, 1, 'should fail'), {message: 'Expected 1 > 1. should fail'});

    assertGreaterEqual(2, 1);
    assertGreaterEqual(2, 2);
    assert.throws(() => assertGreaterEqual('a', 2));
    assert.throws(() => assertGreaterEqual(2, ['2']));
    assert.throws(() => assertGreaterEqual(NaN, 2));
    assert.throws(() => assertGreaterEqual(2, NaN));
    assert.throws(
        () => assertGreaterEqual(0, 1, 'should fail'), {message: 'Expected 0 >= 1. should fail'});

    assertLess(-1, 0);
    assert.throws(() => assertLess('a', 2));
    assert.throws(() => assertLess(1, ['2']));
    assert.throws(() => assertLess(NaN, 2));
    assert.throws(() => assertLess(1, NaN));
    assert.throws(
        () => assertLess(1, 1, 'should fail'), {message: 'Expected 1 < 1. should fail'});

    assertLessEqual(23n, 42n);
    assertLessEqual(42, 42);
    assert.throws(() => assertLess('a', 2));
    assert.throws(() => assertLess(1, ['2']));
    assert.throws(() => assertLess(NaN, 2));
    assert.throws(() => assertLess(1, NaN));
    assert.throws(
        () => assertLessEqual(2, 1, 'should fail'), {message: 'Expected 2 <= 1. should fail'});
}

module.exports = {
    description: '<, <=, >, >= helper assertions in assert_utils',
    run,
    resources: [],
};
