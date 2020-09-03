const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const sub_run = path.join(__dirname, '..', 'bin', 'cli.js');
    const {stderr} = await new Promise((resolve, reject) => {
        child_process.execFile(
            sub_run,
            ['--exit-zero', '--no-screenshots', '--tests-glob', 'tests/skip_tests/*.js', '--no-pdf'],
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    assert(/1 tests passed/.test(stderr), '1 test should pass');
    assert(/1 skipped/.test(stderr), '1 test should be skipped');
}

module.exports = {
    description: 'Test npm cli binary',
    resources: [],
    run,
};
