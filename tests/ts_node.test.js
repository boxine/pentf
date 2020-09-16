const assert = require('assert').strict;
const path = require('path');
const { execFile } = require('./helpers');

async function run() {
    const script = path.join(__dirname, '..', 'bin', 'cli.js');
    const {stderr} = await execFile(
        'node',
        ['-r', 'ts-node/register', script, '--exit-zero', '--no-screenshots', '--tests-glob', 'tests/ts_node/*.ts', '--no-pdf'],
    );

    assert(/1 tests passed/.test(stderr), 'Did run any tests');
}

module.exports = {
    description: 'Support node require hooks',
    run,
};
