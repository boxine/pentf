const assert = require('assert').strict;
const path = require('path');
const { execFile } = require('./helpers');

async function run() {
    // Run in subprocess so that handle exhaustion does not affect this process
    const sub_run = path.join(__dirname, 'timeout_tests', 'run');
    const {stdout, stderr} = await execFile(
        sub_run,
        ['--exit-zero', '--no-screenshots', '--timeout', '100'],
    );

    assert(/Timeout:/.test(stdout), 'Should be a timeout error');
    assert(/1 tests passed/.test(stderr), '1 test should pass');
    assert(/1 failed/.test(stderr), '1 should fail');
}

module.exports = {
    description: 'Test timeout of test cases',
    resources: [],
    run,
};
