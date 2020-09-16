const assert = require('assert').strict;
const path = require('path');
const { execFile } = require('./helpers');

async function run() {
    const sub_run = path.join(__dirname, 'suite', 'run');
    const {stderr} = await execFile(
        sub_run,
        ['--exit-zero', '--no-screenshots', '-f', '^only'],
    );

    assert(/1 tests passed/.test(stderr), 'Only runs 1 test');
}

module.exports = {
    description: 'Load multiple tests from the same file',
    run,
};
