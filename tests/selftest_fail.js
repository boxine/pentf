const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const sub_run = path.join(__dirname, 'fail', 'run');
    const { stdout } = await new Promise((resolve, reject) => {
        child_process.execFile(
            process.execPath,
            [sub_run, '--exit-zero', '--no-screenshots', '-v'],
            { cwd: path.dirname(sub_run) },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({ stdout, stderr });
            }
        );
    });

    assert.doesNotMatch(stdout, /\/pentf\/tests\/\/foo-fail\.js/);
}

module.exports = {
    description: 'Check stack trace not modified',
    run,
};
