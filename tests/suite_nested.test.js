const assert = require('assert').strict;
const path = require('path');
const { execFile } = require('./helpers');

async function run() {
    const sub_run = path.join(__dirname, 'suite', 'run');
    const {stderr} = await execFile(
        sub_run,
        ['--exit-zero', '--no-screenshots', '-f', 'suite_nested$'],
    );

    assert(/6 tests passed/.test(stderr), 'finds 6 tests');
}

module.exports = {
    description: 'Load multiple tests from nested suites',
    run,
};
