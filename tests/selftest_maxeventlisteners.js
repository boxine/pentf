const assert = require('assert').strict;
const child_process = require('child_process');
const path = require('path');

async function run() {
    // Run in subprocess so that handle exhaustion does not affect this process
    const sub_run = path.join(__dirname, 'maxEventListeners_tests', 'run');
    const proc = child_process.spawn(
        process.execPath,
        [sub_run, '--exit-zero', '--no-screenshots', '-C', '4+cpus'],
        {}
    );
    let stderr = '';
    await new Promise(resolve => {
        proc.stderr.on('data', s => {
            stderr += s;
        });
        proc.stderr.on('close', () => resolve());
    });

    assert(
        !/MaxListenersExceededWarning/.test(stderr),
        'MaxListenersExceededWarning should not feature'
    );
}

module.exports = {
    description:
        'Test proper closing of Chrome Windows (not doing it causes the number of maximum event listeners to be overrun)',
    resources: [],
    run,
};
