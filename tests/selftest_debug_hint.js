const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    // Run in subprocess so that handle exhaustion does not affect this process
    const sub_run = path.join(__dirname, 'debug_tests', 'run');

    async function runPentf(...args) {
        return await new Promise((resolve, reject) => {
            child_process.execFile(
                sub_run,
                ['--exit-zero', '--no-screenshots', ...args],
                (err, stdout, stderr) => {
                    if (err) reject(err);
                    else resolve({stdout, stderr});
                }
            );
        });
    }

    let stderr = (await runPentf()).stderr;
    assert(/Pass in -f\/--filter REGEX and -d\/--debug to inspect specific tests/.test(stderr));

    stderr = (await runPentf('-d')).stderr;
    assert(/Pass in -f\/--filter REGEX to inspect specific tests/.test(stderr));

    stderr = (await runPentf('-f test')).stderr;
    assert(/Pass in -d\/--debug to inspect tests/.test(stderr));

    stderr = (await runPentf('-f test -d')).stderr;
    assert(!/Pass in/.test(stderr));
}

module.exports = {
    description: 'Display debug hints',
    resources: [],
    run,
};
