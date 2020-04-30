const assert = require('assert').strict;
const {generateDiff} = require('../output');

function assertDiff(a, b, expected) {
    assert.equal(
        generateDiff({}, {actual: a, expected: b}).trim(),
        expected.join('\n').trim()
    );
}

async function run() {
    assertDiff(
        {foo: 123, bar: 23},
        {bar: 23},
        [
            '   {',
            '     "bar": 23,',
            '  -  "foo": 123,',
            '   }'
        ]
    );

    assertDiff(
        {foo: 123, bar: 23},
        {bar: 23, foo: 1},
        [
            '   {',
            '     "bar": 23,',
            '  -  "foo": 123,',
            '  +  "foo": 1,',
            '   }'
        ]
    );

    assertDiff(
        {foo: 123, bar: [1, 2]},
        {bar: [2, 1], foo: 1},
        [
            '   {',
            '     "bar": [',
            '  +    2,',
            '       1,',
            '  -    2,',
            '     ],',
            '  -  "foo": 123,',
            '  +  "foo": 1,',
            '   }'
        ]
    );

    assertDiff(
        [1, {foo: 123}],
        [{bar: 1}],
        [
            '   [',
            '  -  1,',
            '     {',
            '  -    "foo": 123,',
            '  +    "bar": 1,',
            '     },',
            '   ]'
        ]
    );

    assertDiff(
        { 
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
        }, 
        {
            foo: [
                1,
                2,
                undefined,
                {
                    b: [1, 2, 'asdasd'],
                    c: 123
                }
            ]
        },
        [
            '    "foo": [',
            '       1,',
            '       2,',
            '       undefined,',
            '  -    3,',
            '       {',
            '         "b": [',
            '           1,',
            '           2,',
            '  -        "asd",',
            '           "asdasd",',
            '         ],',
            '         "c": 123,',
            '       },',
        ]
    );
}

module.exports = {
    description: 'Check a diff is generated based on the error',
    resources: [],
    run,
};
