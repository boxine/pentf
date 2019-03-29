const assert = require('assert');

const {_next_task, _resolve_dependencies} = require('../runner');


async function run() {
    assert.strictEqual(_next_task([{id: 't1', status: 'todo'}]).id, 't1');
    assert.strictEqual(_next_task([{id: 't1', status: 'success'}]), undefined);
    assert.strictEqual(_next_task([
        {id: 't1', status: 'error'},
        {id: 't2', status: 'todo'}
    ]).id, 't2');
    assert.strictEqual(_next_task([
        {id: 't1', status: 'error'},
        {id: 't2', status: 'running'}
    ]), undefined);

    const dependency_tasks = [
        {id: 't1', status: 'todo'},
        {id: 't1a', status: 'todo', after: ['t1', 't1b']},
        {id: 't1b', status: 'todo', after: ['t1']},
        {id: 't2', status: 'todo'},
    ];
    _resolve_dependencies(dependency_tasks);
    assert.equal(_next_task(dependency_tasks).id, 't1');

    dependency_tasks[0].status = 'running';
    assert.equal(_next_task(dependency_tasks).id, 't2');

    dependency_tasks[0].status = 'success';
    assert.equal(_next_task(dependency_tasks).id, 't1b');

    dependency_tasks[2].status = 'running';
    assert.equal(_next_task(dependency_tasks).id, 't2');

    dependency_tasks[2].status = 'error';
    assert.equal(_next_task(dependency_tasks).id, 't1a');

    dependency_tasks[1].status = 'running';
    assert.equal(_next_task(dependency_tasks).id, 't2');

    dependency_tasks[3].status = 'running';
    assert.equal(_next_task(dependency_tasks), undefined);

    // Depend on a skipped task: Same thing as a normal task (the task runner will exit immediately though)
    const skiptest_tasks = [
        {id: 't1', status: 'skipped'},
        {id: 't1a', status: 'todo', after: ['t1']}];
    _resolve_dependencies(skiptest_tasks);
    assert.strictEqual(_next_task(skiptest_tasks).id, 't1a');

    // Circular dependencies
    const circular_tasks = [
        {id: 't1', status: 'todo', after: ['t2']},
        {id: 't2', status: 'todo', after: ['t1']},
    ];
    assert.throws(() => _resolve_dependencies(circular_tasks));

    const complex_cyclic = [
        {id: '1', status: 'todo'},
        {id: '2', status: 'todo', after: ['1']},
        {id: '3', status: 'todo', after: ['2', '5']},
        {id: '4', status: 'todo', after: ['1', '3']},
        {id: '5', status: 'todo', after: ['4']},
    ];
    assert.throws(() => _resolve_dependencies(complex_cyclic));

    // But coming twice to the same node is fine
    const complex_tasks = [
        {id: '1', status: 'todo'},
        {id: '2', status: 'todo', after: ['1']},
        {id: '3', status: 'todo', after: ['2']},
        {id: '4', status: 'todo', after: ['2', '3']},
        {id: '5', status: 'todo', after: ['1', '4']},
    ];
    _resolve_dependencies(complex_tasks); // Should not throw
}

module.exports = {
    description: 'Testing the integration test framework itself: selection of next job and dependencies',
    run,
};
