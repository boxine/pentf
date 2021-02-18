const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    // Run in subprocess so that handle exhaustion does not affect this process
    const sub_run = path.join(__dirname, 'no_clear_line', 'run');
    const {stderr} = await new Promise((resolve, reject) => {
        child_process.execFile(
            'node',
            [sub_run, '--exit-zero', '--no-screenshots', '--ci', '-C', '5', '--quiet'],
            { cwd: path.dirname(sub_run) },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    const lines = stderr.split('\n');

    assert.equal(new Set(lines).size, lines.length, 'Should have no duplicate status lines');
}

module.exports = {
    description: 'Test --ci status output should only print if changed',
    resources: [],
    run,
};
