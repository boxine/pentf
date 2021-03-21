const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    {
        // Run in subprocess so that handle exhaustion does not affect this process
        const sub_run = path.join(__dirname, 'error_output', 'run');
        const {stdout} = await new Promise((resolve, reject) => {
            child_process.execFile(
                process.execPath,
                [sub_run, '--exit-zero', '--no-screenshots', '--no-color'],
                { cwd: path.dirname(sub_run) },
                (err, stdout, stderr) => {
                    if (err) reject(err);
                    else resolve({stdout, stderr});
                }
            );
        });

        assert.equal((stdout.match(/test\scase\serror_log/g) || []).length, 1, 'do not repeat error output at the end');
    }

    {
        // Run in subprocess so that handle exhaustion does not affect this process
        const sub_run = path.join(__dirname, 'error_output', 'run');
        const {stdout} = await new Promise((resolve, reject) => {
            child_process.execFile(
                process.execPath,
                [sub_run, '--exit-zero', '--no-screenshots', '--no-color', '-v'],
                { cwd: path.dirname(sub_run) },
                (err, stdout, stderr) => {
                    if (err) reject(err);
                    else resolve({stdout, stderr});
                }
            );
        });

        assert.equal((stdout.match(/test\scase\serror_log/g) || []).length, 2, 'print error output again at the end');
    }
}

module.exports = {
    description: 'Test error stack trace collection logged after runner completed',
    resources: [],
    run,
};
