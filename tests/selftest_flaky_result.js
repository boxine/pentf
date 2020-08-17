
const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const sub_run = path.join(__dirname, 'flaky_tests', 'run');
    const {stderr} = await new Promise((resolve, reject) => {
        child_process.execFile(
            sub_run,
            ['--exit-zero', '--no-colors', '--no-screenshots', '--repeat-flaky', '3', '--ci'],
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    const summary = stderr.split('\n').filter(Boolean).slice(-3).map(s => s.trim());
    assert.deepEqual(summary, [
        '1 tests passed',
        '1 failed (error)',
        '1 flaky (flaky)'
    ]);
}

module.exports = {
    description: 'Test flaky result output',
    run,
};
