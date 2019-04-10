const assert = require('assert');
const deepEqual = require('deep-equal');

const {_nextTask} = require('../runner');
const locking = require('../locking');
const {assertEventually} = require('../utils');

async function run() {
    const outputs = [];
    const config = {
        no_locking: false,
        no_external_locking: true,
        quiet: true,
        locking_verbose: true,
        logFunc: (_, msg) => outputs.push(msg),
    };

    const assertOutput = (expected) => {
        assert.deepStrictEqual(outputs, expected);
        outputs.length = 0;
    };

    const t1 = {id: 't1', status: 'todo', resources: ['test_t1', 'widget']};
    const t2 = {id: 't2', status: 'todo', resources: []};
    const t3 = {id: 't3', status: 'skipped', resources: ['widget']};
    const t4 = {id: 't4', status: 'todo', resources: ['test_t4', 'widget2']};
    const t5 = {id: 't5', status: 'todo', resources: ['test_t5', 'widget2', 'widget3']};
    const t6 = {id: 't6', status: 'todo', resources: ['test_t6', 'widget2', 'widget']};
    const t7 = {id: 't7', status: 'todo', resources: ['test_t7', 'widget']};
    const t8 = {id: 't8', status: 'todo', resources: ['test_t8']};
    const tasks = [t1, t2, t3, t4, t5, t6, t7, t8];
    const state = {tasks, config};

    locking.init(state);
    assert.deepStrictEqual(state.locks, new Set());

    assert.deepStrictEqual(await _nextTask(config, state), t1);
    assert.deepStrictEqual(state.locks, new Set(['test_t1', 'widget']));
    assertOutput(['[locking] t1: Acquired test_t1,widget']);
    t1.status = 'inprogress';

    assert.deepStrictEqual(await _nextTask(config, state), t2);
    assert.deepStrictEqual(state.locks, new Set(['test_t1', 'widget']));
    assertOutput(['[locking] t2: Needs no resources']);
    t2.status = 'inprogress';

    assert.deepStrictEqual(await _nextTask(config, state), t4);
    assert.deepStrictEqual(state.locks, new Set(['test_t1', 'widget', 'test_t4', 'widget2']));
    assertOutput(['[locking] t4: Acquired test_t4,widget2']);
    t4.status = 'inprogress';

    assert.deepStrictEqual(await _nextTask(config, state), t8);
    assert.deepStrictEqual(state.locks, new Set(['test_t1', 'widget', 'test_t4', 'widget2', 'test_t8']));
    assertOutput([
        '[locking] t5: Failed to acquire widget2',
        '[locking] t6: Failed to acquire widget2,widget',
        '[locking] t7: Failed to acquire widget',
        '[locking] t8: Acquired test_t8',
    ]);
    t8.status = 'inprogress';

    const blocked = _nextTask(config, state);
    assert.deepStrictEqual(state.locks, new Set(['test_t1', 'widget', 'test_t4', 'widget2', 'test_t8']));
    await assertEventually(() => {
        const expected = [
            '[locking] t5: Failed to acquire widget2',
            '[locking] t6: Failed to acquire widget2,widget',
            '[locking] t7: Failed to acquire widget',
            '[locking] t5: Trying to eventually acquire test_t5,widget2,widget3',
            '[locking] t5: Failed to acquire widget2',
            '[locking] t5: Failed to acquire widget2',
        ];
        return deepEqual(outputs.slice(0, expected.length), expected);
    }, 'Did not get expected locks for t5 in time', 1000);

    t4.status = 'success';
    await locking.release(config, state, t4);
    await assertEventually(() => {
        return outputs.includes('[locking] t4: Released test_t4,widget2');
    }, 'Locks not successfully released');

    await assertEventually(() => {
        return outputs[outputs.length - 1] === '[locking] t5: Acquired test_t5,widget2,widget3';
    }, 'Could not lock t5');
    outputs.length = 0;
    assert.deepStrictEqual(await blocked, t5);
    assert.deepStrictEqual(state.locks, new Set(['test_t1', 'widget', 'test_t8', 'test_t5', 'widget2', 'widget3']));
    t5.status = 'inprogress';

    t2.status = 'success';
    await locking.release(config, state, t2);
    assertOutput(['[locking] t2: No resources, nothing to release']);

    t5.status = 'errored';
    await locking.release(config, state, t5);
    assertOutput(['[locking] t5: Released test_t5,widget2,widget3']);
    assert.deepStrictEqual(state.locks, new Set(['test_t1', 'widget', 'test_t8']));

    t8.status = 'success';
    await locking.release(config, state, t8);
    assertOutput(['[locking] t8: Released test_t8']);
    assert.deepStrictEqual(state.locks, new Set(['test_t1', 'widget']));

    const blocked2 = _nextTask(config, state);
    assert.deepStrictEqual(state.locks, new Set(['test_t1', 'widget']));
    await assertEventually(() => {
        const expected = [
            '[locking] t6: Failed to acquire widget',
            '[locking] t7: Failed to acquire widget',
            '[locking] t6: Trying to eventually acquire test_t6,widget2,widget',
            '[locking] t6: Failed to acquire widget',
            '[locking] t6: Failed to acquire widget',
        ];
        return deepEqual(outputs.slice(0, expected.length), expected);
    }, 'Did not get expected locks for t6 in time');
    assert.deepStrictEqual(state.locks, new Set(['test_t1', 'widget']));

    t1.status = 'success';
    await locking.release(config, state, t1);
    await assertEventually(() => {
        return outputs[outputs.length - 1] === '[locking] t6: Acquired test_t6,widget2,widget';
    }, 'Could not lock t6');
    assert.deepStrictEqual(state.locks, new Set(['test_t6', 'widget2', 'widget']));
    assert.deepStrictEqual(await blocked2, t6);
    t6.status = 'inprogress';
    outputs.length = 0;

    const blocked3 = _nextTask(config, state);
    assert.deepStrictEqual(state.locks, new Set(['test_t6', 'widget2', 'widget']));
    await assertEventually(() => {
        const expected = [
            '[locking] t7: Failed to acquire widget',
            '[locking] t7: Trying to eventually acquire test_t7,widget',
            '[locking] t7: Failed to acquire widget',
        ];
        return deepEqual(outputs.slice(0, expected.length), expected);
    }, 'Did not get expected locking attempts for t7 in time');

    t6.status = 'success';
    await locking.release(config, state, t6);

    assert.deepStrictEqual(await blocked3, t7);
    assert.deepStrictEqual(state.locks, new Set(['test_t7', 'widget']));

    t7.status = 'success';
    await locking.release(config, state, t7);
    assert.deepStrictEqual(state.locks, new Set());

    assert.deepStrictEqual(await _nextTask(config, state), undefined);
    assert.deepStrictEqual(await _nextTask(config, state), undefined);

    for (const t of tasks) {
        assert(['success', 'errored', 'skipped'].includes(t.status), `Task ${t.id} is not finished: ${t.status}`);
    }
}

module.exports = {
    description: 'Test basic next task selection with locking',
    run,
};
