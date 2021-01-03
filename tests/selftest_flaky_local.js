const assert = require('assert').strict;
const runner = require('../src/runner');
const render = require('../src/render');

/**
 * @param {import('../src/runner').TaskConfig} config
 */
async function run(config) {
    let output = [];
    const runnerConfig = {
        ...config,
        colors: false,
        logFunc: (_, message) => output.push(message),
        quiet: false,
    };


    function createTests() {
        let i = 0;
        /** @type {import('../src/runner').TestCase[]} */
        return [
            {
                name: 'foo',
                retryTimes: 3,
                run: async () => {
                    i++;
                    if (i < 3) {
                        throw new Error('fail');
                    }
                },
            },
        ];
    }

    function assertResult(test_info) {
        const result = render.craftResults(config, test_info);
        const formatted = result.tests.map(t => {
            return {
                id: t.id,
                status: t.status,
                runs: t.taskResults.length,
            };
        });

        assert.deepEqual(formatted, [
            {id: 'foo', status: 'flaky', runs: 3},
        ]);
    }

    // Sequential run
    let tests = createTests();
    output = [];
    let result = await runner.run({...runnerConfig, concurrency: 1}, tests);
    assertResult(result);
    assert(output[output.length-1].includes('1 flaky (foo)'), 'Summary did not include flaky tests');

    // Parallel run
    tests = createTests();
    output = [];
    result = await runner.run({...runnerConfig, concurrency: 1}, tests);
    assertResult(result);
    assert(output[output.length-1].includes('1 flaky (foo)'), 'Summary did not include flaky tests');
}

module.exports = {
    run,
    descripton: 'Rerun task max 3 times',
};
