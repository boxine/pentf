const assert = require('assert').strict;
const path = require('path');
const { execFile } = require('./helpers');

async function run() {
    // Run in subprocess so that handle exhaustion does not affect this process
    const sub_run = path.join(__dirname, 'suite', 'run');
    const {stderr} = await execFile(
        sub_run,
        ['--exit-zero', '--no-screenshots', '-f', 'suite_nested_only$'],
    );

    assert(/2 tests passed/.test(stderr), 'finds 2 tests');
}

module.exports = {
    description: 'Load multiple tests from nested suites',
    run,
};
