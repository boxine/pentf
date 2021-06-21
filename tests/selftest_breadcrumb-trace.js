const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const sub_run = path.join(__dirname, 'breadcrumb-trace', 'run');
    const {stdout} = await new Promise((resolve, reject) => {
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

    const lines = stdout.split('\n');
    assert.match(lines[0], /✓ newPage\(\) \+\d+ms/);
    assert.match(lines[1], /✓ page\.goto\(https:\/\/example\.com\) \+\d+ms/);
    assert.match(lines[2], /✓ waitForSelector\(div\) \+\d+ms/);
    assert.match(lines[3], /✓ waitForSelector\(h1\) \+\d+ms/);
    assert.match(lines[4], /✓ clickText\(example\) \+\d+ms/);
    assert.match(lines[5], /✓ closePage\(\) \+\d+ms/);
}

module.exports = {
    run,
    description: 'Display breadcrumb trace timeout error',
};
