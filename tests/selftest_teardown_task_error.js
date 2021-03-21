const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const sub_run = path.join(__dirname, 'teardown_task_error', 'run');
    const {stdout} = await new Promise((resolve, reject) => {
        child_process.execFile(
            process.execPath,
            [sub_run, '--exit-zero', '--no-screenshots', '-v'],
            { cwd: path.dirname(sub_run) },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    assert(/Teardown success/.test(stdout), 'teardown functions should pass');
}

module.exports = {
    run,
    description: 'Call teardown functions with task error'
};
