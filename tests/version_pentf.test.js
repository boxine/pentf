const assert = require('assert').strict;
const path = require('path');
const { execFile } = require('./helpers');

async function run() {
    const sub_run = path.join(__dirname, 'version_pentf', 'run');
    const {stdout} = await execFile(
        sub_run,
        ['--version'],
    );

    assert(/pentf \d+\.\d+\.\d+/.test(stdout), 'Version string not found');
}

module.exports = {
    run,
    description: 'Should print pentf version number'
};
