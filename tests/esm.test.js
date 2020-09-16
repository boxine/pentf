const assert = require('assert').strict;
const path = require('path');
const { supportsImports } = require('../src/loader');
const { execFile } = require('./helpers');

async function run() {
    // Run in subprocess so that handle exhaustion does not affect this process
    const sub_run = path.join(__dirname, 'esm_tests', 'run');
    const {stdout, stderr} = await execFile(
        sub_run,
        ['--exit-zero', '--no-screenshots'],
    );

    assert.doesNotMatch(stdout, /error/i);
    assert.doesNotMatch(stderr, /failed/i);
}

module.exports = {
    description: 'Test running esm test cases',
    resources: [],
    skip: async () => !await supportsImports(),
    run,
};
