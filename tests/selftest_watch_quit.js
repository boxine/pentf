const child_process = require('child_process');
const assert = require('assert').strict;
const path = require('path');
const {assertEventually} = require('../src/assert_utils');
const {onTeardown} = require('../src/runner');

async function run(config) {
    const sub_run = path.join(__dirname, 'watch_tests', 'run');
    const child = child_process.spawn(sub_run, ['--watch', '--ci', '--no-colors', '--no-pdf', '-f', 'foo']);
    onTeardown(config, () => child.kill());

    const out = [];

    child.stdout.on('data', data => out.push(data.toString()));
    child.stderr.on('data', data => out.push(data.toString()));

    await assertEventually(() => {
        return out.find(msg => /Waiting for file changes/.test(msg));
    });

    // Simulate enter keycode
    child.stdin.write('q');

    await assertEventually(
        () => {
            assert.equal(child.exitCode, 0);
        },
        { crashOnError: false }
    );
}

module.exports = {
    run,
    description: 'Exit watch mode when pressing "q"',
};
