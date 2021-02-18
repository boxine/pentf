const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    // Run in subprocess so that handle exhaustion does not affect this process
    const sub_run = path.join(__dirname, 'timeout_tests', 'run');
    const {stdout, stderr} = await new Promise((resolve, reject) => {
        child_process.execFile(
            'node',
            [sub_run, '--exit-zero', '--no-screenshots', '--timeout', '100'],
            { cwd: path.dirname(sub_run) },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    assert(/Timeout:/.test(stdout), 'Should be a timeout error');
    assert(/1 tests passed/.test(stderr), '1 test should pass');
    assert(/1 failed/.test(stderr), '1 should fail');
}

module.exports = {
    description: 'Test timeout of test cases',
    resources: [],
    run,
};
