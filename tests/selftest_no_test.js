const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const sub_run = path.join(__dirname, 'no_tests', 'run');
    const {stdout} = await new Promise((resolve, reject) => {
        child_process.execFile(
            'node',
            [sub_run, '--exit-zero', '--no-screenshots'],
            { cwd: path.dirname(sub_run) },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    assert(/No tests found/.test(stdout), 'Should print "no tests found" warning');
}

module.exports = {
    description: 'Print message when test file contains no tests',
    run,
};
