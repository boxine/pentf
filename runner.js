/* eslint no-console: 0 */

const assert = require('assert');
const {performance} = require('perf_hooks');

const utils = require('./utils');
const email = require('./email');
const output = require('./output');

async function shutdown() {
    await email.shutdown();
}

// Returns a blocking dependency or none.
function check_depencies(task) {
    if (!task.dependencies) return;

    return task.dependencies.find(dep => ['error', 'skipped'].includes(dep.status));
}

// Returns true iff all dependencies are ok
function verify_dependencies(config, task) {
    const missed_dependency = check_depencies(task);
    if (!missed_dependency) return true;

    task.status = missed_dependency.status;
    const is_skipped = missed_dependency.status === 'skipped';
    output.log(config,
        'test case ' + task.name + ' ' + (is_skipped ? 'SKIPPED' : 'FAILED') +
        ': Prior test ' + missed_dependency.name +
        (is_skipped ? ' was skipped' : ' failed'));
    if (!is_skipped) {
        task.error = new Error(`Prior test ${missed_dependency.name} failed`);
    }
    return false;
}

async function sequential_run(config, state) {
    const skipped = state.filter(s => s.status === 'skipped');
    if (!config.quiet && skipped.length > 0) {
        console.log(`Skipped ${skipped.length} tests (${skipped.map(s => s.name).join(' ')})`);
    }

    let task;
    while ((task = next_task(state))) {
        if (task.status === 'skipped') continue;

        if (!verify_dependencies(config, task)) continue;

        if (! config.quiet) {
            console.log(task.name + ' ...');
        }

        task.status = 'running';
        task.start = performance.now();
        try {
            await task.tc.run(config);
            task.status = 'success';
            task.duration = performance.now() - task.start;
        } catch(e) {
            task.status = 'error';
            task.duration = performance.now() - task.start;
            task.error = e;
            console.log(`test case ${task.name} FAILED at ${(new Date()).toISOString()}:`);
            console.log(e.stack);
            if (config.fail_fast) {
                process.exit(3);
            }
        }
    }
}

async function run_one(config, state, task) {
    output.status(config, state);

    if (task.status === 'skipped') return task;    

    if (!verify_dependencies(config, task)) return task;

    task.status = 'running';
    task.start = performance.now();
    output.status(config, state);

    try {
        await task.tc.run(config);
        task.status = 'success';
        task.duration = performance.now() - task.start;
    } catch(e) {
        task.status = 'error';
        task.duration = performance.now() - task.start;
        task.error = e;
        output.log(config, `test case ${task.name} FAILED at ${(new Date()).toISOString()}:\n${e.stack}\n`);
        if (config.fail_fast) {
            process.exit(3);
        }
    }

    output.status(config, state);
    return task;
}

function next_task(state) {
    for (const task of state) {
        if (task.status !== 'todo') continue;

        if (task.dependencies) {
            if (! task.dependencies.every(dep => ['success', 'error', 'skipped'].includes(dep.status))) {
                // Can't pick this task yet
                continue;
            }
        }

        return task;
    }
}

async function parallel_run(config, state) {
    output.status(config, state);

    // Many tests run 1 or 2 Chrome windows, so make sure we have enough handles.
    // 2 windows per test on avera should be sufficient
    process.setMaxListeners(10 + 2 * config.concurrency);

    const running = [];
    let runner_task_id = 0;
    while (true) {  // eslint-disable-line no-constant-condition
        // Add new tasks
        while (running.length < config.concurrency) {
            const task = next_task(state);
            if (!task) {
                // Nothing to do right now (may be blocked by currently running tasks)
                break;
            }

            task._runner_task_id = runner_task_id;
            const promise = run_one(config, state, task);
            promise._runner_task_id = runner_task_id;
            runner_task_id++;
            running.push(promise);
        }

        if (running.length === 0) {
            for (const task of state) {
                assert(
                    ['skipped', 'success', 'error'].includes(task.status),
                    `Would end testing now, but task ${task.name} is still in status ${task.status}`
                );
            }
            return;  // no more tasks to add, no more tasks running => we're done!
        }

        // Wait for one task to finish
        const done_task = await Promise.race(running);
        utils.remove(running, promise => promise._runner_task_id === done_task._runner_task_id);
    }
}

function resolve_dependencies(tasks) {
    for (const t of tasks) {
        if (!t.after) continue;

        t.dependencies = t.after.map(dependency_id => {
            const dependency = tasks.find(dep => dep.id === dependency_id);
            if (! dependency) {
                throw new Error(
                    `Failed to calculate tasks: Could not find dependency ${dependency_id} of ${t.id}.` +
                    'Pass in -i / --ignore-dependencies to suppress dependency handling.');
            }
            return dependency;
        });
    }

    // Check for circular dependencies
    const checked = new Set();
    for (const t of tasks) {
        if (!t.dependencies) continue;
        if (checked.has(t)) continue;

        const visited = new Set();
        const to_visit = [t];
        while (to_visit.length > 0) {
            const node = to_visit.pop();
            if (!node.dependencies) continue;
            if (checked.has(node)) continue;

            if (visited.has(node)) {
                throw new Error(`Circular dependency detected; ${node.id} is in the cycle`);
            }
            visited.add(node);
            to_visit.push(...node.dependencies);
        }

        for (const node of visited) {
            checked.add(node);
        }
    }
}

async function run(config, test_cases) {
    const test_start = Date.now();

    const state = test_cases.map(tc => {
        const task = {
            tc,
            status: 'todo',
            name: tc.name,
            id: tc.name,
            after: tc.after,
        };

        if (tc.skip && tc.skip(config)) {
            task.status = 'skipped';
        }

        return task;
    });

    if (! config.ignore_dependencies) {
        resolve_dependencies(state);
    }

    if (config.concurrency === 0) {
        await sequential_run(config, state);
    } else {
        try {
            await parallel_run(config, state);
        } finally {
            output.finish(config, state);
        }
    }

    await shutdown();
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
    _next_task: next_task,
    _resolve_dependencies: resolve_dependencies,
};
