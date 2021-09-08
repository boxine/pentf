const assert = require('assert').strict;
const runner = require('../src/runner');
const { wait } = require('../src/utils');

/**
 * @param {import('../src/runner').TaskConfig} config
 * @param {string[]} output
 * @param {number} ms
 * @param {string} name
 */
function effect(config, output, ms, name) {
    runner.onTeardown(config, async () => {
        await wait(ms);
        output.push(name);
    });
}

async function run(config) {
    let output = [];
    await runner.run({ ...config, logFunc: () => null, quiet: true }, [
        {
            name: 'normal teardown',
            run: async config => {
                effect(config, output, 100, 'A');
                effect(config, output, 200, 'B');
                effect(config, output, 0, 'C');
            },
        },
    ]);
    assert.deepEqual(output, ['A', 'B', 'C']);
}

module.exports = {
    run,
    description: 'Teardown hooks must be called in sequence',
};
