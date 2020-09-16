const assert = require('assert').strict;
const path = require('path');
const { execFile } = require('./helpers');

async function run() {
    const sub_run = path.join(__dirname, 'skip_tests', 'run');
    const {stderr} = await execFile(
        sub_run,
        ['--exit-zero', '--html', '--json', '--markdown', '--pdf'],
    );

    assert(/1 tests passed/.test(stderr), 'Should print "1 passed"');
    assert(/1 skipped/.test(stderr), 'Should print "1 skipped"');
}

module.exports = {
    description: 'Test async skip call',
    resources: [],
    run,
};
