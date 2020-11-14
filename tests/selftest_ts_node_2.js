const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const script = path.join(__dirname, 'ts_node_module', 'run');
    const {stdout, stderr} = await new Promise((resolve, reject) => {
        child_process.execFile(
            'node',
            ['-r', 'ts-node/register', script, '--exit-zero', '--no-screenshots', '--no-pdf'],
            { cwd: path.dirname(script) },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    assert.doesNotMatch(stdout, /error/i);
    assert.doesNotMatch(stderr, /failed/i);
}

module.exports = {
    description: 'Test running esm detection with package.json module field',
    resources: [],
    run,
};
