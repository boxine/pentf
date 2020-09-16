
const assert = require('assert').strict;
const path = require('path');
const { execFile } = require('./helpers');

async function run() {
    const sub_run = path.join(__dirname, 'flaky_tests', 'run');
    const {stderr} = await execFile(
        sub_run,
        ['--exit-zero', '--no-colors', '--no-screenshots',  '--repeat', '3', '--repeat-flaky', '3', '--quiet'],
    );

    const lines = stderr.split('\n').filter(Boolean);
    const status = lines.slice(0, -3);

    // Check that failure count is consistent
    let failed = 0;
    for (const line of status) {
        const m = /(\d+)\sfailed/g.exec(line);
        if (m) {
            const actual_failed = +m[1];
            if (failed > 0) {
                assert(
                    failed <= actual_failed,
                    `Failed test count decreased in status output.\nCurrent: ${actual_failed}\nPrevious: ${failed}`
                );
            }
            failed = actual_failed;
        }
    }

    const summary = lines.slice(-3).map(s => s.trim());
    assert.deepEqual(summary, [
        '3 tests passed',
        '3 failed (error[0], error[1], error[2])',
        '3 flaky (flaky[0], flaky[1], flaky[2])'
    ]);
}

module.exports = {
    description: 'Test flaky result output when --repeat is enabled',
    run,
};
