const assert = require('assert').strict;

const { cmp, cmpKey, cmpKeys } = require('../src/utils');

async function run() {
    // cmp
    assert.strictEqual(cmp('foo', 'bar'), 1);
    assert.strictEqual(cmp('bar', 'foo'), -1);
    assert.strictEqual(cmp('foo', 'foo'), 0);

    // cmpKey
    assert.strictEqual(
        cmpKey('someKey')({ someKey: 5 }, { anotherKey: 1, someKey: 9 }),
        -1
    );
    assert.strictEqual(cmpKey('someKey')({ someKey: 9 }, { someKey: 5 }), 1);
    assert.strictEqual(
        cmpKey('someKey')({ someKey: 4, x: 5 }, { someKey: 4, x: 6 }),
        0
    );
    let sample = [
        { k: 5, anotherKey: 4 },
        { x: 42, k: 2 },
        { anotherKey: 1, k: 9 },
        { k: 7 },
    ];
    sample.sort(cmpKey('k'));
    assert.deepStrictEqual(sample, [
        { x: 42, k: 2 },
        { k: 5, anotherKey: 4 },
        { k: 7 },
        { anotherKey: 1, k: 9 },
    ]);

    // cmpKeys for multiple keys
    assert.strictEqual(cmpKeys('a', 'b')({ a: 5 }, { a: 1, b: 10 }), 1);
    assert.strictEqual(cmpKeys('a', 'b')({ a: 5 }, { a: 9, b: 10 }), -1);
    assert.strictEqual(cmpKeys('a', 'b')({ a: 5, b: 9 }, { a: 3, b: 4 }), 1);
    assert.strictEqual(cmpKeys('a', 'b')({ a: 3, b: 9 }, { a: 5, b: 4 }), -1);
    assert.strictEqual(cmpKeys('a', 'b')({ a: 3, b: 9 }, { a: 5, b: 4 }), -1);

    sample = [
        { a: 3, b: 4 },
        { a: 5, b: 2, x: 'foo' },
        { a: 3, b: 3 },
        { a: 2, b: 99 },
        { b: 1, a: 99 },
        { b: 2, a: 2 },
        { x: 'bar', a: 3, b: 0 },
    ];
    sample.sort(cmpKeys('a', 'b'));
    assert.deepStrictEqual(sample, [
        { a: 2, b: 2 },
        { a: 2, b: 99 },
        { a: 3, b: 0, x: 'bar' },
        { a: 3, b: 3 },
        { a: 3, b: 4 },
        { a: 5, b: 2, x: 'foo' },
        { a: 99, b: 1 },
    ]);
}

module.exports = {
    description: 'Testing sort utility functions',
    run,
};
