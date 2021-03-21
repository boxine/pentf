const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    // Run in subprocess so that handle exhaustion does not affect this process
    const sub_run = path.join(__dirname, 'console_navigation', 'run');
    const {stdout} = await new Promise((resolve, reject) => {
        child_process.execFile(
            process.execPath,
            [sub_run, '--exit-zero', '--no-screenshots', '--forward-console'],
            { cwd: path.dirname(sub_run) },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    assert(/Some warning/.test(stdout), 'Should use fallback log');
}

module.exports = {
    description: 'Print fallback console when execution context is destroyed.',
    resources: [],
    skip: () => 'Test is timing sensitive',
    run,
};
