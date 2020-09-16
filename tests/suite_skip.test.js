const assert = require('assert').strict;
const path = require('path');
const { execFile } = require('./helpers');

async function run() {
    const sub_run = path.join(__dirname, 'suite', 'run');
    const {stderr} = await execFile(
        sub_run,
        ['--exit-zero', '--no-screenshots', '-f', '^skip'],
    );

    assert(/3 tests passed/.test(stderr), 'Expected 3 tests to pass');
    assert(/3 skipped/.test(stderr), 'Expected 3 tests to be marked as skipped');
}

module.exports = {
    description: 'Don\'t run skipped test in a suite',
    run,
};
