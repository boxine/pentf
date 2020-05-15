/* eslint no-console: 0 */

const assert = require('assert').strict;
const path = require('path');
const {performance} = require('perf_hooks');
const {promisify} = require('util');
const mkdirp = require('mkdirp');

const browser_utils = require('./browser_utils');
const email = require('./email');
const external_locking = require('./external_locking');
const locking = require('./locking');
const output = require('./output');
const utils = require('./utils');
const version = require('./version');
const {timeoutPromise} = require('./promise_utils');


async function run_task(config, task) {
    const task_config = {...config, _browser_pages: []};
    try {
        await task.tc.run(task_config);
        task.status = 'success';
        task.duration = performance.now() - task.start;
        if (task.expectedToFail && !config.expect_nothing) {
            const etf = (typeof task.expectedToFail === 'string') ? ` (${task.expectedToFail})` : '';
            const label = output.color(config, 'inverse-red', 'PASSED');
            output.log(
                config,
                `${label} test case ${output.color(config, 'lightCyan', task.name)}` +
                `, but expectedToFail was set${etf}\n`);
        }
    } catch(e) {
        if (!e || !e.stack) {
            // eslint-disable-next-line no-ex-assign
            e = new Error(`Non-error object thrown by ${task.name}: ${output.valueRepr(e)}`);
        }

        task.status = 'error';
        task.duration = performance.now() - task.start;
        task.error = e;
        if (e.pentf_expectedToFail) {
            task.expectedToFail = e.pentf_expectedToFail;
        }

        if (config.take_screenshots) {
            try {
                task.error_screenshots = await Promise.all(task_config._browser_pages.map(
                    async (page, i) => {
                        await promisify(mkdirp)(config.screenshot_directory);
                        const fn = path.join(
                            config.screenshot_directory, `${task.id || task.name}-${i}.png`);
                        return await page.screenshot({
                            path: fn,
                            type: 'png',
                            fullPage: true,
                        });
                    }));
            } catch(e) {
                output.log(config, `INTERNAL ERROR: failed to take screenshot of ${task.name}: ${e}`);
            }
        }
        // Close all browser windows
        if (! config.keep_open && task_config._browser_pages.length > 0) {
            try {
                await Promise.all(task_config._browser_pages.slice().map(page => browser_utils.closePage(page)));
            } catch(e) {
                output.log(config, `INTERNAL ERROR: Unable to close browser pages of ${task.name}: ${e}`);
            }
        }

        const show_error = (
            !(config.ignore_errors && (new RegExp(config.ignore_errors)).test(e.stack)) &&
            (config.expect_nothing || !task.expectedToFail));
        if (show_error) {
            const name = output.color(config, 'lightCyan', task.name);
            if (e.pentf_expectedToSucceed) {
                const label = output.color(config, 'inverse-green', 'PASSED');
                output.log(
                    config, `${label} test case ${name} at ${utils.localIso8601()} but section was expected to fail:\n${e.stack}\n`);
            } else {
                const label = output.color(config, 'inverse-red', 'FAILED');
                output.log(
                    config,
                    `${label} test case ${name} at ${utils.localIso8601()}:\n` +
                    `${output.formatError(config, e)}\n`);
            }
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

async function parallel_run(config, state) {
    output.status(config, state);

    if (config.keep_open) {
        // We will have many, many  Chrome windows. Disable the maxListener limit
        process.setMaxListeners(0);
    } else {
        // Many tests run 1 or 2 Chrome windows, so make sure we have enough handles.
        // 2 windows per test on average should be sufficient
        process.setMaxListeners(10 + 2 * config.concurrency);
    }

    state.running = [];
    state.locking_backoff = 10;
    let runner_task_id = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        // Add new tasks
        while (state.running.length < config.concurrency) {
            let task = undefined;
            let anyLocked = false;
            for (const t of state.tasks) {
                if (t.status !== 'todo') continue;

                if (! await locking.acquire(config, state, t)) {
                    anyLocked = true;
                    continue;
                }

                task = t; // Found a task to do!
                state.locking_backoff = 100;
                break;
            }
            if (!task) {
                if (anyLocked) {
                    if (config.verbose || config.locking_verbose) {
                        output.log(config, `[runner] All tasks are locked, sleeping for ${state.locking_backoff} ms`);
                    }
                    await utils.wait(state.locking_backoff);
                    state.locking_backoff = Math.min(2 * state.locking_backoff, 10000);
                }
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
            if (state.tasks.some(t => t.status === 'todo')) {
                // Still waiting for locks
                if (config.verbose || config.locking_verbose) {
                    const waitingTasksStr = state.tasks.filter(t => t.status === 'todo').map(t => t.id).join(',');
                    output.log(config, `[runner] Still waiting for locks on tasks ${waitingTasksStr}`);
                }
                continue;
            }

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

function testCases2tasks(config, testCases) {
    const repeat = config.repeat || 1;
    assert(Number.isInteger(repeat), `Repeat configuration is not an integer: ${repeat}`);

    const tasks = new Array(testCases.length * repeat);
    testCases.forEach((tc, position) => {
        const task = {
            tc,
            status: 'todo',
            name: tc.name,
            id: tc.name,
        };

        const skipReason = tc.skip && tc.skip(config);
        if (skipReason) {
            task.status = 'skipped';
            if (typeof skipReason === 'string') {
                task.skipReason = skipReason;
            }
        }

        if (Object.prototype.hasOwnProperty.call(tc, 'expectedToFail')) {
            if (typeof tc.expectedToFail === 'function') {
                task.expectedToFail = tc.expectedToFail(config);
            } else {
                task.expectedToFail = tc.expectedToFail;
            }
        }

        locking.annotateTaskResources(config, task);

        if (skipReason || (repeat === 1)) {
            tasks[position] = task;
            return;
        }

        for (let runId = 0;runId < repeat;runId++) {
            tasks[runId * testCases.length + position] = {
                ...task,
                id: `${tc.name}_${runId}`,
                name: `${tc.name}[${runId}]`,
            };
        }
    });
    return tasks.filter(t => t);
}

async function run(config, testCases) {
    const test_start = Date.now();

    external_locking.prepare(config);
    const initData = config.beforeAllTests ? await config.beforeAllTests(config) : undefined;

    const tasks = testCases2tasks(config, testCases);
    const state = {
        config,
        tasks,
    };

    try {
        if (config.manually_lock) {
            const resources = config.manually_lock.split(',');
            const acquireRes = await external_locking.externalAcquire(config, resources, 60000);
            if (acquireRes !== true) {
                throw new Error(
                    `Failed to lock ${acquireRes.resource}: ` +
                    `Locked by ${acquireRes.client}, expires in ${acquireRes.expireIn}ms`);
            }
        }

        if (config.print_tasks) {
            console.log(tasks);
            return;
        }

        if (config.list_conflicts) {
            locking.listConflicts(config, tasks);
            return;
        }

        if (config.clear_external_locks) {
            await external_locking.clearAllLocks(config);
            return;
        }

        if (config.list_locks) {
            await external_locking.listLocks(config);
            return;
        }

        if (config.display_locking_client) {
            console.log(config.external_locking_client);
            return;
        }

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

        await timeoutPromise(
            config, locking.shutdown(config, state),
            {message: 'locking shutdown', warning: true});
        await timeoutPromise(
            config, email.shutdown(config),
            {message: 'email shutdown', warning: true});
    } finally {
        if (config.afterAllTests) {
            await timeoutPromise(
                config, config.afterAllTests(config, initData),
                {message: 'afterAllTests function', warning: true});
        }
    }
    const test_end = Date.now();

    const testsVersion = await timeoutPromise(
        config, version.testsVersion(config), {message: 'version determination', warning: true});
    const pentfVersion = version.pentfVersion();

    return {
        test_start,
        test_end,
        pentfVersion,
        testsVersion,
        state,
    };
}

module.exports = {
    run,
};
