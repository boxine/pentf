const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const sub_run = path.join(__dirname, 'suite', 'run');
    const {stderr} = await new Promise((resolve, reject) => {
        child_process.execFile(
            process.execPath,
            [sub_run, '--exit-zero', '--no-screenshots', '-f', '^skip'],
            { cwd: path.dirname(sub_run) },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    assert(/3 tests passed/.test(stderr), 'Expected 3 tests to pass');
    assert(/3 skipped/.test(stderr), 'Expected 3 tests to be marked as skipped');
}

module.exports = {
    description: 'Don\'t run skipped test in a suite',
    run,
};
