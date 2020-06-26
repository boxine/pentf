const assert = require('assert').strict;
const {formatTable} = require('../output');

async function run() {
    assert.equal(
        formatTable([
            ['Used', 'Covered', 'Uncovered Lines'],
            ['foo', '93.75%', ''],
            ['foo bar bob boof baz', '34.87%', ''],
            ['foo bar bob', '17.8%', ''],
        ]),
        `Used                  Covered  Uncovered Lines 
foo                    93.75%                  
foo bar bob boof baz   34.87%                  
foo bar bob             17.8%                  
`
    );
}

module.exports = {
    description: 'Format a table for logging to cli',
    run,
    resources: [],
};
