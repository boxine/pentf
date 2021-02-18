const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const sub_run = path.join(__dirname, 'options', 'run');

    const {stdout} = await new Promise((resolve, reject) => {
        child_process.execFile(
            'node',
            [sub_run, '--exit-zero', '--no-screenshots', '--ci', '--print-config', '--quiet'],
            {cwd: path.dirname(sub_run)},
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    assert.match(stdout, /foo:\s+123/g);
}

module.exports = {
    description: 'Pass options to config',
    run,
};
