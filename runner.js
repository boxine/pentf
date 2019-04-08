/* eslint no-console: 0 */

const assert = require('assert');
const {performance} = require('perf_hooks');

const email = require('./email');
const locking = require('./locking');
const output = require('./output');
const utils = require('./utils');

async function shutdown(config) {
    await email.shutdown(config);
}

async function run_task(config, task) {
    try {
        await task.tc.run(config);
        task.status = 'success';
        task.duration = performance.now() - task.start;
    } catch(e) {
        task.status = 'error';
        task.duration = performance.now() - task.start;
        task.error = e;

        if (!config.ignore_errors || !(new RegExp(config.ignore_errors)).test(e.stack)) {
            output.log(config, `test case ${task.name} FAILED at ${utils.localIso8601()}:\n${e.stack}\n`);
        }
        if (config.fail_fast) {
            process.exit(3);
        }
    }
}

async function sequential_run(config, state) {
    const skipped = state.tasks.filter(s => s.status === 'skipped');
    if (!config.quiet && skipped.length > 0) {
        console.log(`Skipped ${skipped.length} tests (${skipped.map(s => s.name).join(' ')})`);
    }

    for (const task of state.tasks) {
        if (task.status === 'skipped') continue;
        await locking.acquireEventually(config, state, task);

        if (! config.quiet) {
            console.log(task.name + ' ...');
        }

        task.status = 'running';
        task.start = performance.now();
        await run_task(config, task);

        await locking.release(config, state, task);
    }
}

async function run_one(config, state, task) {
    output.status(config, state);

    if (task.status === 'skipped') return task;    

    task.status = 'running';
    task.start = performance.now();
    output.status(config, state);

    await run_task(config, task);

    output.status(config, state);
    return task;
}

async function nextTask(config, state) {
    assert(state);
    assert(state.tasks);

    let firstBlockedTask = undefined;
    for (const task of state.tasks) {
        if (task.status !== 'todo') continue;

        if (! await locking.acquire(config, state, task)) {
            if (! firstBlockedTask) {
                firstBlockedTask = task;
            }
            continue;
        }

        return task;
    }

    if (firstBlockedTask) {
        // Everything locked, block until the first task can run again
        await locking.acquireEventually(config, state, firstBlockedTask);
        return firstBlockedTask;
    }

    return undefined; // Did not find any task
}

async function parallel_run(config, state) {
    output.status(config, state);

    // Many tests run 1 or 2 Chrome windows, so make sure we have enough handles.
    // 2 windows per test on average should be sufficient
    process.setMaxListeners(10 + 2 * config.concurrency);

    state.running = [];
    let runner_task_id = 0;
    while (true) {  // eslint-disable-line no-constant-condition
        // Add new tasks
        while (state.running.length < config.concurrency) {
            const task = await nextTask(config, state);
            if (!task) {
                // Nothing to do right now (may be blocked by currently running tasks)
                break;
            }

            task._runner_task_id = runner_task_id;
            const promise = run_one(config, state, task);
            if (config.verbose) output.log(config, `[runner] started task #${task._runner_task_id}: ${task.id}`);
            promise._runner_task_id = runner_task_id;
            runner_task_id++;
            state.running.push(promise);
        }

        if (state.running.length === 0) {
            for (const task of state.tasks) {
                assert(
                    ['skipped', 'success', 'error'].includes(task.status),
                    `Would end testing now, but task ${task.name} is still in status ${task.status}`
                );
            }
            return;  // no more tasks to add, no more tasks running => we're done!
        }

        // Wait for one task to finish
        const done_task = await Promise.race(state.running);
        if (config.verbose) output.log(config, `[runner] finished task #${done_task._runner_task_id}: ${done_task.id} (${done_task.status})`);
        await locking.release(config, state, done_task);
        utils.remove(state.running, promise => promise._runner_task_id === done_task._runner_task_id);
    }
}

async function run(config, test_cases) {
    const test_start = Date.now();

    const tasks = test_cases.map(tc => {
        const task = {
            tc,
            status: 'todo',
            name: tc.name,
            id: tc.name,
        };

        if (tc.skip && tc.skip(config)) {
            task.status = 'skipped';
        }

        locking.annotateTaskResources(config, task);

        return task;
    });

    if (config.print_tasks) {
        console.log(tasks);
        return;
    }

    const state = {
        config,
        tasks,
    };
    await locking.init(state);

    if (config.concurrency === 0) {
        await sequential_run(config, state);
    } else {
        try {
            await parallel_run(config, state);
        } finally {
            output.finish(config, state);
        }
    }

    await locking.shutdown(config, state);
    await shutdown(config);
    const test_end = Date.now();

    return {
        test_start,
        test_end,
        state,
    };
}

module.exports = {
    run,
    // testing only
    _nextTask: nextTask,
};
