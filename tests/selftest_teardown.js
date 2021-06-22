const assert = require('assert').strict;
const runner = require('../src/runner');

/**
 * @param {import('../src/runner').TaskConfig} config
 * @param {string[]} output
 */
function effect(config, output) {
    output.push('run effect');
    runner.onTeardown(config, () => {
        output.push('teardown effect');
    });
}

/**
 * @param {import('../src/runner').TaskConfig} config
 * @param {string[]} output
 */
function failingEffect(config, output) {
    output.push('run failingEffect');
    runner.onTeardown(config, async () => {
        throw new Error('fail');
    });
}

async function run(config) {
    let output = [];
    await runner.run({ ...config, logFunc: () => null, quiet: true }, [
        {
            name: 'normal teardown',
            run: async config => {
                effect(config, output);
            },
        },
    ]);
    assert.deepEqual(output, ['run effect', 'teardown effect']);

    // Fail on teardown
    const logs = [];
    await runner.run(
        { ...config, logFunc: (_, msg) => logs.push(msg), quiet: true },
        [
            {
                name: 'normal teardown',
                run: async config => {
                    failingEffect(config, output);
                },
            },
        ]
    );

    assert(
        /INTERNAL ERROR.*teardown/.test(logs.join('')),
        'should print internal error message'
    );

    // Call call if keep_open and successful test
    output = [];
    await runner.run(
        { ...config, keep_open: true, logFunc() {}, quiet: true },
        [
            {
                name: 'normal teardown',
                run: async config => {
                    effect(config, output);
                },
            },
        ]
    );
    assert.deepEqual(output, ['run effect', 'teardown effect']);

    // Don't call if keep_open and failing test
    output = [];
    await runner.run(
        { ...config, keep_open: true, logFunc() {}, quiet: true },
        [
            {
                name: 'normal teardown',
                run: async config => {
                    effect(config, output);
                    throw new Error('fail');
                },
            },
        ]
    );
    assert.deepEqual(output, ['run effect']);
}

module.exports = {
    run,
    description: 'Call teardown functions',
};
