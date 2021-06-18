const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');
const runner = require('../src/runner');
const kolorist = require('kolorist');

async function run(config) {
    const sub_run = path.join(__dirname, 'breadcrumb-trace', 'run');
    const {stdout, stderr} = await new Promise((resolve, reject) => {
        child_process.execFile(
            process.execPath,
            [sub_run, '--exit-zero', '--no-screenshots', '--forward-console', '--no-pdf'],
            {cwd: path.dirname(sub_run)},
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    console.log(stdout, stderr)
}

module.exports = {
    run,
    description: 'Display breadcrumb on timeout error',
};
