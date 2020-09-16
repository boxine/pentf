const assert = require('assert').strict;
const {stringify} = require('../src/output');

async function run() {
    assert.equal(stringify(1), '1');
    assert.equal(stringify(0), '0');
    assert.equal(stringify(-10), '-10');
    assert.equal(stringify('a'), '"a"');
    assert.equal(stringify('abcde'), '"abcde"');
    assert.equal(stringify(true), 'true');
    assert.equal(stringify(false), 'false');
    assert.equal(stringify(null), 'null');
    assert.equal(stringify(undefined), 'undefined');

    // Object
    assert.equal(stringify({}), '{}');
    assert.equal(stringify({ a: 123, b: null }), [
        '{',
        '  "a": 123,',
        '  "b": null,',
        '}'
    ].join('\n'));
    assert.equal(stringify({ b: null, a: 123 }), [
        '{',
        '  "a": 123,',
        '  "b": null,',
        '}'
    ].join('\n'));
    assert.equal(stringify({ b: { b1: 123 }, a: 123 }), [
        '{',
        '  "a": 123,',
        '  "b": {',
        '    "b1": 123,',
        '  },',
        '}'
    ].join('\n'));
    assert.equal(stringify({ b: {}, a: 123 }), [
        '{',
        '  "a": 123,',
        '  "b": {},',
        '}'
    ].join('\n'));

    // Array
    assert.equal(stringify([1, 'a', null]), [
        '[',
        '  1,',
        '  "a",',
        '  null,',
        ']'
    ].join('\n'));
    assert.equal(stringify([1, [1, 2]]), [
        '[',
        '  1,',
        '  [',
        '    1,',
        '    2,',
        '  ],',
        ']'
    ].join('\n'));
    assert.equal(stringify([1, []]), [
        '[',
        '  1,',
        '  [],',
        ']'
    ].join('\n'));

    // Mixed
    assert.equal(
        stringify({
            foo: [
                1,
                2,
                undefined,
                3,
                {
                    c: 123,
                    b: [1, 2, 'asd', 'asdasd']
                }
            ]
        }),
        [
            '{',
            '  "foo": [',
            '    1,',
            '    2,',
            '    undefined,',
            '    3,',
            '    {',
            '      "b": [',
            '        1,',
            '        2,',
            '        "asd",',
            '        "asdasd",',
            '      ],',
            '      "c": 123,',
            '    },',
            '  ],',
            '}'
        ].join('\n'),
    );
}

module.exports = {
    description: 'Verify stringification',
    resources: [],
    run,
};
