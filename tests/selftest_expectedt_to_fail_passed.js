const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const sub_run = path.join(__dirname, 'expected_to_fail_but_passed', 'run');
    const code = await new Promise((resolve) => {
        child_process.execFile(
            sub_run,
            ['--no-screenshots'],
            (err) => {
                resolve(err ? err.code : 0);
            }
        );
    });

    assert.equal(code, 3);
}

module.exports = {
    description: 'Treat expected to fail but passed as failure',
    run,
};
