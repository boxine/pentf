const child_process = require('child_process');
const path = require('path');
const fs = require('fs');
const { assertEventually } = require('../src/assert_utils');
const { onTeardown } = require('../src/runner');

async function run(config) {
    const sub_run = path.join(__dirname, 'watch_tests', 'run');
    const child = child_process.spawn(sub_run, ['--watch', '--ci', '--no-colors', '--no-pdf']);
    onTeardown(config, () => child.kill());

    const out = [];

    child.stdout.on('data', data => out.push(data.toString()));
    child.stderr.on('data', data => out.push(data.toString()));

    await assertEventually(() => {
        return out.find(msg => /Waiting for file changes/.test(msg));
    });

    const test = path.join(path.dirname(sub_run), 'bar.js');
    const content = await fs.promises.readFile(test, 'utf-8');
    // Write back to file
    await fs.promises.writeFile(test, content);

    // Make sure only one test is run
    await assertEventually(() => {
        return out.find(msg => /1 tests passed/.test(msg));
    });
}

module.exports = {
    run,
    description: 'Only re-run changed files',
};
