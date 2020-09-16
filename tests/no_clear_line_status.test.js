const assert = require('assert').strict;
const path = require('path');
const { execFile } = require('./helpers');

async function run() {
    const sub_run = path.join(__dirname, 'no_clear_line', 'run');
    const {stderr} = await execFile(
        sub_run,
        ['--exit-zero', '--no-screenshots', '--ci', '-C', '5', '--quiet'],
    );

    const lines = stderr.split('\n');

    assert.equal(new Set(lines).size, lines.length, 'Should have no duplicate status lines');
}

module.exports = {
    description: 'Test --ci status output should only print if changed',
    resources: [],
    run,
};
