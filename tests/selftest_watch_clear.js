const child_process = require('child_process');
const path = require('path');
const {assertEventually} = require('../src/assert_utils');
const {onTeardown} = require('../src/runner');

async function run(config) {
    const sub_run = path.join(__dirname, 'watch_tests_no_writes', 'run');
    const child = child_process.spawn(sub_run, ['--watch', '--ci', '--no-colors', '--no-pdf', '-f', 'foo']);
    onTeardown(config, () => child.kill());

    const out = [];

    child.stdout.on('data', data => out.push(data.toString()));
    child.stderr.on('data', data => out.push(data.toString()));

    await assertEventually(() => {
        return out.find(msg => /Waiting for file changes/.test(msg));
    });

    // Simulate enter keycode
    child.stdin.write(String.fromCharCode(13));

    // Make sure only one test is run
    await assertEventually(() => {
        return out.find(msg => /1 tests passed/.test(msg));
    });

    // Simulate enter keycode
    child.stdin.write('a');

    // Make sure only one test is run
    await assertEventually(
        () => {
            return out.find(msg => /2 tests passed/.test(msg));
        },
        { message: 'Test filter should be reset' }
    );
}

module.exports = {
    run,
    description: 'Clear filters in watch mode when pressing "a"',
};
