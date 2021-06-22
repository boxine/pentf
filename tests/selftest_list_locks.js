const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const sub_run = path.join(__dirname, 'locks', 'run');

    try {
        await new Promise((resolve, reject) => {
            child_process.execFile(
                process.execPath,
                [
                    sub_run,
                    '--exit-zero',
                    '--no-screenshots',
                    '--ci',
                    '--list-locks',
                    '--quiet',
                ],
                { cwd: path.dirname(sub_run) },
                (err, stdout, stderr) => {
                    if (err) reject(err);
                    else resolve({ stdout, stderr });
                }
            );
        });
    } catch (e) {
        console.log(e);
        assert.fail('--list-locks should not throw');
    }
}

module.exports = {
    description: 'Should not throw when listing locks',
    run,
};
