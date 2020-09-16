const assert = require('assert').strict;
const path = require('path');
const { execFile } = require('./helpers');

async function run() {
    const sub_run = path.join(__dirname, 'console_navigation', 'run');
    const {stdout} = await execFile(
        sub_run,
        ['--exit-zero', '--no-screenshots', '--forward-console'],
    );

    assert(/Some warning/.test(stdout), 'Should use fallback log');
}

module.exports = {
    description: 'Print fallback console when execution context is destroyed.',
    resources: [],
    skip: () => 'Test is timing sensitive',
    run,
};
