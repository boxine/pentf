const assert = require('assert');

const runner = require('../runner');
const {expectedToFail} = require('../promise_utils');

async function run() {
    let output = [];
    const runnerConfig = {
        no_locking: true,
        concurrency: 0,
        quiet: true,
        env: 'totallybroken',
        logFunc: (_config, msg) => output.push(msg),
    };

    const testCases = [{
        name: 'normal_ok',
        run: async () => {},
    }, {
        name: 'section_fail',
        run: async config => {
            await expectedToFail(config, 'error message', async () => {
                throw new Error('error in section');
            });
        },
    }, {
        name: 'section_ok',
        run: async config => {
            await expectedToFail(config, 'this succeeds but is expected to fail', async () => {});
        },
    }, {
        name: 'section_expectNothing_fail',
        run: async config => {
            await expectedToFail(
                config, 'on this environment, this should work but does not',
                async () => {throw new Error('should work');},
                {expectNothing: true},
            );
        },
    }, {
        name: 'section_expectNothing_ok',
        run: async config => {
            await expectedToFail(
                config, 'on this environment, this should work and does',
                async () => {},
                {expectNothing: true});
        },
    }];

    await runner.run(runnerConfig, testCases);
    assert(! output.some(o => o.includes('test case normal_ok')));
    assert(! output.some(o => o.includes(' FAILED  test case section_fail')));
    assert(output.some(o => o.includes(' PASSED  test case section_ok')));
    assert(output.some(o => o.includes(' FAILED  test case section_expectNothing_fail')));
    assert(! output.some(o => o.includes('test case section_expectNothing_ok')));

    output = [];
    runnerConfig.expect_nothing = true;
    await runner.run(runnerConfig, testCases);
    assert(! output.some(o => o.includes('test case normal_ok')));
    assert(output.some(o => o.includes(' FAILED  test case section_fail')));
    assert(! output.some(o => o.includes('test case section_ok')));
    assert(output.some(o => o.includes(' FAILED  test case section_expectNothing_fail')));
    assert(! output.some(o => o.includes('test case section_expectNothing_ok')));
}

module.exports = {
    description: 'The expectedToFail section can be used to mark a part of a test which should fail',
    run,
};
