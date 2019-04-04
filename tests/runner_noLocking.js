const assert = require('assert');

const {_nextTask} = require('../runner');


async function run() {
    const config = {no_locking: true};

    assert.deepStrictEqual(
        await _nextTask(config, {
            tasks: [{id: 't1', status: 'todo'}]
        }),
        {id: 't1', status: 'todo'});

    assert.deepStrictEqual(
        await _nextTask(config, {
            tasks: [{id: 't1', status: 'success'}],
        }),
        undefined);

    assert.deepStrictEqual(
        await _nextTask(config, {
            tasks: [
                {id: 't1', status: 'error'},
                {id: 't2', status: 'todo'}
            ],
        }),
        {id: 't2', status: 'todo'});

    assert.deepStrictEqual(
        await _nextTask(config, {
            tasks: [
                {id: 't1', status: 'error'},
                {id: 't2', status: 'running'}
            ],
        }),
        undefined);

    assert.deepStrictEqual(
        await _nextTask(config, {
            tasks: [
                {id: 't1', status: 'skipped'},
                {id: 't2', status: 'skipped'}
            ],
        }),
        undefined);
}

module.exports = {
    description: 'Test basic next task selection (without locking)',
    run,
};
