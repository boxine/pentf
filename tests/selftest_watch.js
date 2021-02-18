const child_process = require('child_process');
const path = require('path');
const fs = require('fs');
const { assertEventually } = require('../src/assert_utils');
const { onTeardown } = require('../src/runner');

async function run(config) {
    const sub_run = path.join(__dirname, 'watch_tests', 'run');
    const child = child_process.spawn('node', [sub_run, '--watch', '-f', 'foo', '--ci', '--no-colors', '--no-pdf']);
    onTeardown(config, () => child.kill());

    const out = [];

    child.stdout.on('data', data => out.push(data.toString()));
    child.stderr.on('data', data => out.push(data.toString()));

    await assertEventually(() => {
        return out.find(msg => /Waiting for file changes/.test(msg));
    });

    const test = path.join(path.dirname(sub_run), 'foo.js');
    const content = await fs.promises.readFile(test, 'utf-8');
    // Write back to file
    await fs.promises.writeFile(test, content);

    await assertEventually(() => out.find(msg => /1 tests passed/.test(msg)));
}

module.exports = {
    run,
    description: 'Re-run test files if they change',
    skip: () => process.env.CI && 'Watch mode is flaky inside a container'
};
