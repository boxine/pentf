const assert = require('assert').strict;
const {parseArgs} = require('../src/config');

async function run() {
    assert.equal(parseArgs({}, [ '--ci']).ci, true);

    // Only pentf.main
    assert.equal(
        parseArgs(
            {
                testsGlob: '*.foo.js',
            },
            []
        ).testsGlob,
        '*.foo.js'
    );
    // Only cli
    assert.equal(parseArgs({}, ['--tests-glob', '*.bar.js']).testsGlob, '*.bar.js');
    // Both pentf.main + cli. Cli should overwrite properties
    assert.equal(
        parseArgs(
            {
                testsGlob: '*.foo.js',
            },
            ['--tests-glob', '*.bar.js']
        ).testsGlob,
        '*.bar.js'
    );
}

module.exports = {
    run,
    description: 'Test cli argument parsing',
};
