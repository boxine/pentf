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
        repeatFlaky: 3,
        quiet: true,
    };


    function createTests() {
        let i = 0;
        let j = 0;
        /** @type {import('../src/runner').TestCase[]} */
        return [
            {
                name: 'foo',
                run: async () => {
                    i++;
                    if (i < 3) {
                        throw new Error('fail');
                    }
                },
            },
            {
                name: 'bar',
                run: async () => {
                    throw new Error('fail');
                },
            },
            {
                name: 'baz',
                run: async () => {},
            },
            {
                name: 'bob',
                run: async () => {
                    j++;
                    if (j < 2) {
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
            {id: 'bar', status: 'error', runs: 3},
            {id: 'bob', status: 'flaky', runs: 2},
            {id: 'foo', status: 'flaky', runs: 3},
            {id: 'baz', status: 'success', runs: 1},
        ]);
    }

    // Sequential run
    let tests = createTests();
    output = [];
    let result = await runner.run({...runnerConfig, concurrency: 1}, tests);
    assertResult(result);
    assert(output[output.length-1].includes('2 flaky (foo, bob)'), 'Summary did not include flaky tests');

    // Parallel run
    tests = createTests();
    output = [];
    result = await runner.run({...runnerConfig, concurrency: 1}, tests);
    assertResult(result);
    assert(output[output.length-1].includes('2 flaky (foo, bob)'), 'Summary did not include flaky tests');
}

module.exports = {
    run,
    descripton: 'Rerun task when flakyness is detected',
};
