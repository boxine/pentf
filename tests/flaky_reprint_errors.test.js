
const assert = require('assert').strict;
const path = require('path');
const {execFile} = require('./helpers');

async function run() {
    const sub_run = path.join(__dirname, 'flaky_tests', 'run');
    const {stdout} = await execFile(
        sub_run,
        ['--exit-zero', '--no-colors', '--no-screenshots', '--repeat-flaky', '3', '--ci', '-f', 'flaky'],
    );

    assert.equal((stdout.match(/Error: fail/g) || []).length, 2);
}

module.exports = {
    description: 'Don\'t include flaky tasks when re-printing errors',
    run,
};
