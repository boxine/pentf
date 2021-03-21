const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    // Run in subprocess so that handle exhaustion does not affect this process
    const sub_run = path.join(__dirname, 'esm_tests', 'run');
    const {stdout, stderr} = await new Promise((resolve, reject) => {
        child_process.execFile(
            process.execPath,
            [sub_run, '--exit-zero', '--no-screenshots'],
            { cwd: path.dirname(sub_run) },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    assert.doesNotMatch(stdout, /error/i);
    assert.doesNotMatch(stderr, /failed/i);
}

module.exports = {
    description: 'Test running esm test cases',
    resources: [],
    run,
};
