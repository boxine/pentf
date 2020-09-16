const assert = require('assert').strict;
const path = require('path');
const { execFile } = require('./helpers');

async function run() {
    const sub_run = path.join(__dirname, 'glob_tests', 'run');
    const {stderr} = await execFile(
        sub_run,
        ['--exit-zero', '--no-screenshots', '--tests-glob', '*.spec.js'],
    );

    assert(/1 tests passed/.test(stderr), '1 test should pass');
}

module.exports = {
    description: 'Test glob options',
    resources: [],
    run,
};
