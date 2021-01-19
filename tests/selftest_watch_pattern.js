const child_process = require('child_process');
const path = require('path');
const assert = require('assert');
const {assertEventually} = require('../src/assert_utils');
const {onTeardown} = require('../src/runner');
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
            await assertEventually(
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
    const sub_run = path.join(__dirname, 'watch_tests_no_writes', 'run');
    const child = child_process.spawn(sub_run, ['--watch', '--ci', '--no-colors', '--no-pdf']);
    onTeardown(config, () => child.kill());

    let out = [];
    const type = createTyper(() => out, () => (out = []));

    child.stdout.on('data', data => out.push(data.toString()));
    child.stderr.on('data', data => out.push(data.toString()));

    await assertEventually(() => {
        return out.find(msg => /Waiting for file changes/.test(msg));
    });

    out = [];

    // Simulate p keycode
    await type(child, 'p', /Start typing to filter/);

    // Simulate typing keycode
    await type(child, 'foo', /pattern › foo/);

    assert.deepStrictEqual(out.join('').split('\n'), [
        'pattern › foo ' ,
        '' ,
        '  foo',
        '',
        'Press Esc to exit pattern mode',
        'Press Enter to apply pattern',
        ''
    ]);

    const ENTER = String.fromCharCode(13);
    const ESCAPE = String.fromCharCode(27);
    const ARROW_DOWN = '↓';
    const ARROW_UP = '↑';

    await type(child, ENTER, /1 tests passed/);

    // Clear filters
    await type(child, 'c', /waiting for file changes/i);
    await type(child, ENTER, /2 tests passed/);

    // Test escape pattern
    await type(child, 'p', /Start typing to filter/);
    await type(child, 'bar', /bar/);
    await type(child, ENTER, /1 tests passed/);

    await type(child, 'p', /pattern ›/);
    await type(child, 'foo', /foo/);
    await type(child, ESCAPE, /Active filter: bar/);

    await type(child, 'c', /(?!Active filter)/i);

    // Test cursor selection
    await type(child, 'p', /Start typing to filter/);
    await type(child, '.*', /bar\s+foo/);
    await type(child, ARROW_DOWN, /- bar/);
    await type(child, ARROW_DOWN, /- foo/);
    await type(child, ARROW_DOWN, /- foo/);
    await type(child, ARROW_UP, /- bar/);
    await type(child, ENTER, /Active filter: \^bar\$/);
    await type(child, ENTER, /1 tests passed/);


    // Enter an invalid filter
    await type(child, 'c', /(?!Active filter)/i);
    await type(child, 'p', /Start typing to filter/);
    await type(child, '*', /Pattern contains invalid characters/);

    await type(child, ESCAPE, /waiting for file changes/i);

    // Toggle debug mode
    await type(child, 'd', /Debug mode:/i);
    await type(child, 'd', /(?!Debug mode:)/i);
}

module.exports = {
    run,
    description: 'Clear filters in watch mode when pressing "a"',
};
