const assert = require('assert');
const {generateDiff} = require('../output');

async function run() {
    try {
        assert.deepEqual({foo: 123,bar:23}, {bar:23});
    } catch (err) {
        assert.equal(
            generateDiff(err).trim(),
            [
                '   {',
                '  -  "foo": 123,',
                '     "bar": 23',
                '   }'
            ].join('\n').trim()
        );
    }
}

module.exports = {
    description: 'Check a diff is generated based on the error',
    resources: [],
    run,
};
