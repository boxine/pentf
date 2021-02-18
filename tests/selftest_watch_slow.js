const child_process = require('child_process');
const path = require('path');
const fs = require('fs');
const { assertEventually } = require('../src/assert_utils');
const { onTeardown } = require('../src/runner');

async function run(config) {
    const sub_run = path.join(__dirname, 'watch_tests', 'run');
    const child = child_process.spawn('node', [sub_run, '--watch', '-f', 'slow', '--ci', '--no-colors', '--no-pdf']);
    onTeardown(config, () => child.kill());
    const out = [];

    child.stdout.on('data', data => out.push(data.toString()));
    child.stderr.on('data', data => out.push(data.toString()));

    await assertEventually(() => {
        return out.find(msg => /Waiting for file changes/.test(msg));
    });

    const test = path.join(path.dirname(sub_run), 'slow.js');
    const content = await fs.promises.readFile(test, 'utf-8');
    await fs.promises.writeFile(test, content);

    // Trigger a file change when the first run is not finished
    await assertEventually(() => out.find(msg => /Updated/.test(msg)));
    await fs.promises.writeFile(test, content);

    await assertEventually(() => out.find(line => /1 tests passed/.test(line)));
}

module.exports = {
    run,
    // Note: In the long term we should find a way to cancel pending tests
    description: 'Wait until previous run is complete in watch mode',
    skip: () => process.env.CI && 'Watch mode is flaky inside a container',
};
