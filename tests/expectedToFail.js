const assert = require('assert');

const runner = require('../runner');

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
        name: 'normal_success',
        run: async () => {},
    }, {
        name: 'normal_failure',
        run: async () => {throw new Error('fail');},
    }, {
        name: 'expected_failure_true',
        run: async () => {throw new Error('fail');},
        expectedToFail: true,
    }, {
        name: 'works_except_on_totallybroken',
        run: async config => {
            if (config.env == 'totallybroken') throw new Error('fail');
        },
        expectedToFail: config => (config.env == 'totallybroken'),
    }, {
        name: 'unexpected_success',
        run: async() => {},
        expectedToFail: () => true,
    }, {
        name: 'expected_success',
        run: async() => {},
        expectedToFail: config => {
            assert(config.env);
        },
    }];

    await runner.run(runnerConfig, testCases);
    assert(! output.some(o => o.includes('test case normal_success')));
    assert(output.some(o => o.includes('test case normal_failure FAILED')));
    assert(! output.some(o => o.includes('test case expected_failure_true FAILED')));
    assert(! output.some(o => o.includes('test case works_except_on_totallybroken FAILED')));
    assert(output.some(o => o.includes('test case unexpected_success SUCCEEDED')));
    assert(! output.some(o => o.includes('test case expected_success')));

    output = [];
    runnerConfig.expect_nothing = true;
    await runner.run(runnerConfig, testCases);
    assert(output.some(o => o.includes('test case normal_failure FAILED')));
    assert(output.some(o => o.includes('test case expected_failure_true FAILED')));
    assert(output.some(o => o.includes('test case works_except_on_totallybroken FAILED')));
}

module.exports = {
    description: 'The expectedToFail attribute can be used to mark that a test should fail or not',
    run,
};
