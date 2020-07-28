const assert = require('assert').strict;
const {craftResults} = require('../render');
const runner = require('../runner');

async function run(config) {
    const noop = async () => null;
    const fail = async () => {
        throw new Error('fail');
    };

    /** @type {import('../runner').TestCase[]} */
    const cases = [
        {name: 'success', run: noop},
        {name: 'skipped', run: noop, skip: () => true},
        {name: 'expectedToFailButPassed', run: noop, expectedToFail: 'fail'},
        {name: 'expectedToFail', run: fail, expectedToFail: 'fail'},
        {name: 'error #2', run: fail},
        {name: 'error #1', run: fail},
    ];

    const testConfig = {...config, logFunc: () => null};
    const info = await runner.run(testConfig, cases);
    const results = craftResults(config, info).tests.map(t => t.name);
    assert.deepEqual(results, [
        'error #1',
        'error #2',
        'expectedToFailButPassed',
        'expectedToFail',
        'skipped',
        'success',
    ]);
}

module.exports = {
    run,
    description: 'Order test results by severity in rendered artifacts',
};
