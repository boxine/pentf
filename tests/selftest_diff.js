const assert = require('assert');
const kolorist = require('kolorist');
const {generateDiff} = require('../output');

async function run() {
    try {
        assert.deepEqual({foo: 123,bar:23}, {bar:23});
    } catch (err) {
        assert.equal(
            kolorist.stripColors(generateDiff(err)).trim(),
            [
                '\n',
                ' {',
                '-  "foo": 123,',
                '   "bar": 23',
                ' }'
            ].join('\n').trim()
        );
    }
}

module.exports = {
    description: 'Check a diff is generated based on the error',
    resources: [],
    run,
};
