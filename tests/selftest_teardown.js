const assert = require('assert').strict;
const runner = require('../runner');

/**
 * @param {import('../runner').TaskConfig} config
 * @param {string[]} output
 */
function effect(config, output) {
    output.push('run effect');
    runner.onTeardown(config, () => {
        output.push('teardown effect');
    });
}

/**
 * @param {import('../runner').TaskConfig} config
 * @param {string[]} output
 */
function failingEffect(config, output) {
    output.push('run failingEffect');
    runner.onTeardown(config, async () => {
        throw new Error('fail');
    });
}

async function run(config) {
    const output = [];
    await runner.run(
        {...config, logFunc: () => null},
        [
            { name: 'normal teardown', run: async (config) => {
                effect(config, output);
            }}
        ]
    );
    assert.deepEqual(output, ['run effect', 'teardown effect']);

    // Fail on teardown
    const logs = [];
    await runner.run(
        {...config, logFunc: (_, msg) => logs.push(msg)},
        [
            { name: 'normal teardown', run: async (config) => {
                failingEffect(config, output);
            }}
        ]
    );

    assert(/INTERNAL ERROR.*teardown/.test(logs.join('')), 'should print internal error message');
}

module.exports = {
    run,
    description: 'Call teardown functions'
};
