const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const sub_run = path.join(__dirname, 'version_ci_tests', 'run');
    const {stdout, stderr} = await new Promise((resolve, reject) => {
        child_process.execFile(
            process.execPath,
            [sub_run],
            { cwd: path.dirname(sub_run), env: { ...process.env, CI: 'true' } },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    assert(/pentf \d+\.\d+\.\d+/.test(stdout), 'Version string not found');
    assert(/tests passed/.test(stderr), 'Did not run any tests');
}

module.exports = {
    run,
    description: 'Should print pentf version number'
};
