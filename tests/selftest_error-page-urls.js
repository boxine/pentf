const assert = require('assert').strict;
const child_process = require('child_process');
const path = require('path');

/**
 * @param {string} test
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function runPentf(test) {
    const sub_run = path.join(__dirname, 'breadcrumb', 'run');
    return new Promise((resolve, reject) => {
        child_process.execFile(
            process.execPath,
            [sub_run, '--exit-zero', '--no-colors', '--no-screenshots', '--ci', '-f', test],
            { cwd: path.dirname(sub_run) },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });
}

async function run() {
    {
        const {stdout} = await runPentf('with-page');
        assert.match(stdout, /Open pages: https:\/\/example.com\//);
    }
    {
        const {stdout} = await runPentf('no-page');
        assert.doesNotMatch(stdout, /Open pages:/);
    }
}

module.exports = {
    description: 'Print urls of openend pages in error output',
    run,
};
