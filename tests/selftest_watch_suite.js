const child_process = require('child_process');
const path = require('path');
const { waitFor } = require('../src/assert_utils');
const { onTeardown } = require('../src/runner');
const { wait } = require('../src/utils');

/**
 *
 * @param {() => string[]} getOutput
 * @param {() => void} clearOutput
 * @returns {(child: child_process.ChildProcessWithoutNullStreams, input: string, retryUntil?: RegExp) => Promise<void>}
 */
function createTyper(getOutput, clearOutput) {
    return async (child, input, retryUntil) => {
        clearOutput();
        const chars = input.split('');
        for (let i = 0; i < chars.length; i++) {
            await wait(100);
            clearOutput();
            child.stdin.write(chars[i]);
        }

        if (retryUntil) {
            await waitFor(
                () => {
                    const out = getOutput();
                    return out.find(msg => retryUntil.test(msg));
                },
                {
                    timeout: 2000,
                    message: `Didn't match ${retryUntil.toString()}\n${getOutput().join('\n')}`
                }
            );
        }
    };
}

async function run(config) {
    const sub_run = path.join(__dirname, 'watch_suite', 'run');
    const child = child_process.spawn(process.execPath, [sub_run, '--watch', '--ci', '--no-colors', '--no-pdf']);
    onTeardown(config, () => child.kill());

    let out = [];
    const type = createTyper(() => out, () => (out = []));

    child.stdout.on('data', data => out.push(data.toString()));
    child.stderr.on('data', data => out.push(data.toString()));

    await waitFor(() => {
        return out.find(msg => /Waiting for file changes/.test(msg));
    });

    out = [];

    // Simulate p keycode
    await type(child, 'p', /Start typing to filter/);

    // Simulate typing keycode
    await type(child, 'suite_nested_only', /pattern › suite_nested_only/);

    const ENTER = String.fromCharCode(13);
    await type(child, ENTER, /2 tests passed/);
}

module.exports = {
    run,
    description: 'Filter and run suites in watch mode',
    skip: () => process.env.CI && 'Watch mode is flaky inside a container',
};
