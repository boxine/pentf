const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const script = path.join(__dirname, 'ts_node', 'run');
    const {stderr} = await new Promise((resolve, reject) => {
        child_process.execFile(
            process.execPath,
            ['-r', 'ts-node/register', script, '--exit-zero', '--no-screenshots', '--tests-glob', 'tests/ts_node/*.ts', '--no-pdf'],
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    assert(/1 tests passed/.test(stderr), 'Did run any tests');
}

module.exports = {
    description: 'Support node require hooks',
    run,
};
