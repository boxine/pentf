const path = require('path');
const fs = require('fs');
const { assertEventually } = require('../src/assert_utils');
const { spawn } = require('./helpers');

async function run(config) {
    const sub_run = path.join(__dirname, 'watch_tests', 'run');
    const out = [];
    spawn(
        config,
        sub_run,
        ['--watch', '--watch-files', 'no-test.js', '--tests-glob', 'test.js', '--ci', '--no-colors', '--no-pdf'],
        data => out.push(data),
    );

    await assertEventually(() => {
        return out.find(msg => /Waiting for file changes/.test(msg));
    });

    const test = path.join(path.dirname(sub_run), 'no-test.js');
    const content = await fs.promises.readFile(test, 'utf-8');
    await fs.promises.writeFile(test, content);

    await assertEventually(() => {
        return out.find(msg => /1 tests passed/.test(msg));
    });
}

module.exports = {
    run,
    description: 'Re-run if watched non-test files change',
    skip: () => process.env.CI && 'Watch mode is flaky inside a container',
};
