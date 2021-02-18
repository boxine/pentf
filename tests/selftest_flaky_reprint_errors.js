
const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const sub_run = path.join(__dirname, 'flaky_tests', 'run');
    const {stdout} = await new Promise((resolve, reject) => {
        child_process.execFile(
            'node',
            [sub_run, '--exit-zero', '--no-colors', '--no-screenshots', '--repeat-flaky', '3', '--ci', '-f', 'flaky'],
            { cwd: path.dirname(sub_run) },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    assert.equal((stdout.match(/Error: fail/g) || []).length, 2);
}

module.exports = {
    description: 'Don\'t include flaky tasks when re-printing errors',
    run,
};
