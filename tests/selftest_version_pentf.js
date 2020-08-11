const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const sub_run = path.join(__dirname, 'version_pentf', 'run');
    const {stdout} = await new Promise((resolve, reject) => {
        child_process.execFile(
            sub_run,
            ['--version'],
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    assert(/pentf \d+\.\d+\.\d+/.test(stdout), 'Version string not found');
}

module.exports = {
    run,
    description: 'Should print pentf version number'
};
