const assert = require('assert').strict;
const { onTeardown } = require('../../src/runner');

async function run(config) {
    onTeardown(config, (config) => {
        assert(config.error, 'Task error was not found in task_config object');
        assert.strictEqual(config.error.message, 'fail');
        console.log('Teardown success');
    });

    throw new Error('fail');
}

module.exports = {
    run,
    description: 'Call teardown functions with task error'
};
