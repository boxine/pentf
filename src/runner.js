/* eslint no-console: 0 */

const assert = require('assert').strict;
const path = require('path');
const {performance} = require('perf_hooks');
const {promisify} = require('util');
const mkdirp = require('mkdirp');
const kolorist = require('kolorist');

const browser_utils = require('./browser_utils');
const email = require('./email');
const external_locking = require('./external_locking');
const locking = require('./locking');
const output = require('./output');
const utils = require('./utils');
const version = require('./version');
const {timeoutPromise} = require('./promise_utils');
const { shouldShowError } = require('./output');

/**
 * @typedef {(config: import('./config') => Promise<void> | void)} TeardownHook
 */

/**
 * Add a callback to execute during the teardown phase of the test case.
 * @param {TaskConfig} config
 * @param {TeardownHook} callback
 */
function onTeardown(config, callback) {
    config._teardown_hooks.push(callback);
}

// Work around JSDoc limitation, which doesn't seem to support extending
// interfaces on the fly.
/**
 * @typedef {Object} RawTaskConfig
 * @property {TeardownHook[]} _teardown_hooks
 * @property {import('puppeteer').Page[]} _browser_pages
 * @property {Error | null} _breadcrumb
 * @property {string} _testName
 * @property {string} _taskName
 * @property {string} _taskGroup
 */

/**
 * @typedef {import('./config').Config & RawTaskConfig} TaskConfig
 */

/**
 * @param {import('./config').Config} config
 * @param {Task} task
 * @private
 */
async function run_task(config, task) {
    /** @type {TaskConfig} */
    const task_config = {
        ...config,
        _teardown_hooks: [],
        _browser_pages: [],
        _breadcrumb: null,
        _testName: task.tc.name,
        _taskName: task.name,
        _taskGroup: task.group,
        start: task.start,
    };
    let timeout;
    try {
        const timeoutMs = config.timeout || 3600000;
        // Prevent task from hanging indefinitely
        const timeoutPromise = new Promise(resolve => {
            timeout = setTimeout(resolve, timeoutMs);
        });

        let finished = false;
        const testPromise = Promise.resolve(task.tc.run(task_config))
            .finally(() => (finished = true));

        await Promise.race([
            testPromise,
            timeoutPromise
        ]);

        if (!finished) {
            throw new Error(`Timeout: Test case "${task.tc.name}" didn't finish in ${timeoutMs}ms.`);
        }

        clearTimeout(timeout);

        task.status = 'success';
        output.logVerbose(
            config,
            `[task] Marked #${task._runner_task_id} (${task.name}) as success`
        );
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

        task.duration = performance.now() - task.start;
        task.error = e;
        task.breadcrumb = task_config._breadcrumb;
        if (e.pentf_expectedToFail) {
            task.expectedToFail = e.pentf_expectedToFail;
        }

        if (config.take_screenshots) {
            output.logVerbose(
                config,
                `[task] Taking ${task_config._browser_pages.length} screenshots for task` +
                ` #${task._runner_task_id} (${task.name})`);
            try {
                const screenshotPromise = Promise.all(task_config._browser_pages.map(
                    async (page, i) => {
                        await promisify(mkdirp)(config.screenshot_directory);
                        const fn = path.join(
                            config.screenshot_directory, `${task.id || task.name}-${i}.png`);
                        return await page.screenshot({
                            path: fn,
                            type: 'png',
                            fullPage: true,
                        });
                    })
                );
                task.error_screenshots = await timeoutPromise(
                    config, screenshotPromise,
                    {timeout: 10000, message: 'screenshots took too long'});
            } catch(e) {
                output.log(
                    config,
                    `INTERNAL ERROR: failed to take screenshot of #${task.id} (${task.name}): ${e}`);
            }
        }
        // Close all browser windows
        if (! config.keep_open && task_config._browser_pages.length > 0) {
            output.logVerbose(
                config,
                `[task] Closing ${task_config._browser_pages.length} browser pages for task` +
                ` #${task._runner_task_id} (${task.name})`);
            try {
                await Promise.all(task_config._browser_pages.slice().map(page => browser_utils.closePage(page)));
            } catch(e) {
                output.log(config, `INTERNAL ERROR: Unable to close browser pages of ${task.name}: ${e}`);
            }
        }

        await output.logTaskError(config, task);
        const show_error = output.shouldShowError(config, task);
        output.logVerbose(
            config,
            '[task] Decided whether to show error for task ' +
            `${task._runner_task_id} (${task.name}): ${JSON.stringify(show_error)}`
        );
        if (config.sentry && show_error && !e.pentf_expectedToSucceed) {
            output.logVerbose(
                config,
                '[task] Reporting error to sentry for ' +
                `${task._runner_task_id} (${task.name})`
            );

            try {
                const Sentry = require('@sentry/node');
                Sentry.withScope(scope => {
                    scope.setTag('task', task.name);
                    scope.setTag('testcase', task.tc.name);
                    if (process.env.CI_JOB_URL) {
                        scope.setTag('jobUrl', process.env.CI_JOB_URL);
                    }
                    Sentry.captureException(e);
                });
            } catch (sentryErr) {
                output.log(
                    config,
                    `INTERNAL ERROR: Sentry reporting failed for ${task.name}: ${sentryErr}`);
            }
        }

        output.logVerbose(
            config, `[task] Error teardown done for ${task._runner_task_id} (${task.name})`);

        task.status = 'error';

        if (config.fail_fast) {
            process.exit(3);
        }
    } finally {
        if (!config.keep_open || task.status === 'success') {
            output.logVerbose(`[runner] Executing ${task_config._teardown_hooks.length} teardown hooks`);
            try {
                // Run teardown functions if there are any
                const teardownPromise = Promise.all(task_config._teardown_hooks.map(fn => fn(config)));
                await timeoutPromise(
                    config,
                    teardownPromise,
                    {timeout: 30000, message: 'teardown took too long'}
                );
            } catch(e) {
                output.log(
                    config,
                    `INTERNAL ERROR: failed to run teardown for #${task.id} (${task.name}): ${e}`
                );
            }
        }
    }
}

/**
 * @param {import('./config').Config} config
 * @param {RunnerState} state
 * @private
 */
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

        await run_one(config, state, task);

        await locking.release(config, state, task);
    }
}

/**
 * Update test results
 * @param {import('./config').Config} config
 * @param {RunnerState} state
 * @param {Task} task
 */
function update_results(config, state, task) {
    const { resultByTaskGroup, flakyCounts } = state;
    const {group} = task;
    assert(group);

    const result = resultByTaskGroup.get(group);
    assert(result);

    let status = task.status;
    if (config.repeatFlaky > 0 && status === 'success' || status === 'error') {
        const runs = flakyCounts.get(group) || 1;
        // Not flaky if the first run was successful
        if (!(runs === 1 && task.status === 'success')) {
            // If task is failing, but we haven't reached the limit, then
            // we are still trying to determine if the test is flaky.
            if (runs < config.repeatFlaky && task.status === 'error') {
                status = 'todo';
            } else if (task.status === 'success') {
                // At this point the test was run more than 1 time. This means
                // that the test previously errored, but passes now. Therefore we
                // must be dealing with a flaky one.
                status = 'flaky';
            } else {
                // All retries errored, so we have an actual error.
                status = 'error';
            }
        }
    }
    result.status = status;

    // Append the task result if the task finished
    if (task.status === 'error' || task.status === 'success' || task.status === 'skipped') {
        result.taskResults.push({
            status: task.status,
            duration: task.duration, // TODO,
            error_stack: task.error ?
                // Node's assert module modifies the Error's stack property and
                // adds ansi color codes. These can only be disabled globally via
                // an environment variable, but we want to keep colorized output
                // for the cli. So we need to strip the ansi codes from the assert
                // stack.
                kolorist.stripColors(task.error.stack)
                : null,
            error_screenshots: task.error_screenshots,
        });
    }
}

/**
 * @param {import('./config').Config} config
 * @param {RunnerState} state
 * @param {Task} task
 * @private
 */
async function run_one(config, state, task) {
    output.status(config, state);

    if (task.status === 'skipped') return task;

    const count = state.flakyCounts.get(task.group) || 0;
    state.flakyCounts.set(task.group, count + 1);

    task.status = 'running';
    task.start = performance.now();
    output.status(config, state);

    await run_task(config, task);

    const repeat = config.repeat || 1;
    if (count < config.repeatFlaky - 1 && task.status === 'error' && !task.expectedToFail) {
        output.logVerbose(config, `[runner] Retrying task for flaky detection. Retry count: ${count + 1} (${task.id})`);
        const tcName = task.tc.name;
        state.tasks.push({
            ...task,
            status: 'todo',
            breadcrumb: null,
            id: `${tcName}_${repeat + count}`,
            name: `${tcName}[${repeat + count}]`,
            // Keep group the same, so that we can group results together
            group: task.group
        });
    }

    update_results(config, state, task);
    output.status(config, state);
    return task;
}

/**
 * @param {import('./config').Config} config
 * @param {RunnerState} state
 * @private
 */
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

    let statusInterval;
    if (config.status_interval) {
        statusInterval = setInterval(
            () => output.detailedStatus(config, state),
            config.status_interval
        );
    }

    state.running = [];
    state.locking_backoff = 10;
    let runner_task_id = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (config.verbose) {
            const tasksStr = state.running.map(t => `#${t._runner_task_id}`).join(' ');
            output.log(config, `[runner] running tasks: ${tasksStr}`);
        }

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
            output.logVerbose(config, `[runner] started task #${task._runner_task_id}: ${task.id}`);
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

            // Unsubscribe from status updates
            if (statusInterval) {
                clearInterval(statusInterval);
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
        if (config.verbose) {
            const tasksStr = state.running.map(t => `#${t._runner_task_id}`).join(' ');
            output.log(config, `[runner] waiting for one of the tasks ${tasksStr} to finish`);
        }
        const done_task = await Promise.race(state.running);
        output.logVerbose(config, `[runner] finished task #${done_task._runner_task_id}: ${done_task.id} (${done_task.status})`);
        await locking.release(config, state, done_task);
        utils.remove(state.running, promise => promise._runner_task_id === done_task._runner_task_id);
    }
}

/**
 * @typedef {Object} TestCase
 * @param {string} name
 * @param {(config: import('./config').Config) => Promise<void> | void} run
 * @param {(config: import('./config').Config) => Promise<boolean> | boolean} [skip]
 * @param {string} [expectedToFail]
 */

/**
 * @typedef {"success" | "running" | "error" | "todo" | "skipped"} TaskStatus
 */

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} name Name of the task.
 * @property {string} group The name of the group this task belongs to. This is used for repeatFlaky
 * @property {TestCase} tc
 * @property {TaskStatus} status
 * @property {number} start
 * @property {Error | null} breadcrumb
 * @property {boolean} [skipReason]
 * @property {Buffer[]} error_screenshots
 * @property {boolean | ((config: import('./config').Config) => boolean)} [expectedToFail]
 */

/**
 * @param {RunnerState["resultByTaskGroup"]} resultByTaskGroup
 * @param {Task} task
 */
function initTaskResult(resultByTaskGroup, task) {
    resultByTaskGroup.set(task.group, {
        expectedToFail: task.expectedToFail,
        skipReason: task.skipReason,
        id: task.id,
        status: task.status,
        name: task.name,
        group: task.group,
        description: task.tc.description,
        skipped: task.status === 'skipped',
        taskResults: []
    });
}

/**
 * @param {import('./config').Config} config
 * @param {TestCase[]} testCases
 * @param {RunnerState["resultByTaskGroup"]} resultByTaskGroup
 * @returns {Promise<Task[]>}
 * @private
 */
async function testCases2tasks(config, testCases, resultByTaskGroup) {
    const repeat = config.repeat || 1;
    assert(Number.isInteger(repeat), `Repeat configuration is not an integer: ${repeat}`);

    const tasks = new Array(testCases.length * repeat);
    await Promise.all(testCases.map(async (tc, position) => {
        /** @type {Task} */
        const task = {
            tc,
            resources: tc.resources || [],
            status: 'todo',
            name: tc.name,
            group: tc.name,
            id: tc.name,
            start: 0,
        };

        const skipReason = tc.skip && await tc.skip(config);
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
            initTaskResult(resultByTaskGroup, task);
            return;
        }

        for (let runId = 0;runId < repeat;runId++) {
            const repeatTask = {
                ...task,
                breadcrumb: null,
                id: `${tc.name}_${runId}`,
                group: `${tc.name}_${runId}`,
                name: `${tc.name}[${runId}]`,
            };
            tasks[runId * testCases.length + position] = repeatTask;
            initTaskResult(resultByTaskGroup, repeatTask);
        }
    }));
    return tasks.filter(t => t);
}

/**
 * @typedef {Object} RunnerState
 * @property {Task[]} tasks
 * @property {Set<string>} [locks]
 * @property {NodeJS.Timeout} [external_locking_refresh_timeout]
 * @property {string} last_logged_status The last status string that was logged
 * to the console.
 * @property {Map<string, number>} flakyCounts Track flakyness run count of a test
 * @property {Map<string, import('./render').TestResult>} resultByTaskGroup
 */

/**
 * @typedef {Object} RunnerResult
 * @property {number} test_start
 * @property {number} test_end
 * @property {RunnerState} state
 * @property {string} pentfVersion
 * @property {string} testsVersion
 */

/**
 * @param {import('./config').Config} config
 * @param {TestCase[]} testCases
 * @returns {RunnerResult}
 * @private
 */
async function run(config, testCases) {
    const test_start = Date.now();

    external_locking.prepare(config);
    const initData = config.beforeAllTests ? await config.beforeAllTests(config) : undefined;

    /** @type {RunnerState["resultByTaskGroup"]} */
    const resultByTaskGroup = new Map();
    const tasks = await testCases2tasks(config, testCases, resultByTaskGroup);
    /** @type {RunnerState} */
    const state = {
        flakyCounts: new Map(),
        tasks,
        resultByTaskGroup,
        last_logged_status: ''
    };

    if (config.sentry) {
        const sentry_dsn = config.sentry_dsn;
        assert(
            sentry_dsn,
            'Sentry enabled with --sentry, but no DSN configured. Use --sentry-dsn,' +
            ' set the configuration sentry_dsn, or the environment variable SENTRY_DSN.'
        );
        const Sentry = require('@sentry/node');
        Sentry.init({
            dsn: sentry_dsn,
            environment: config.env,
            beforeBreadcrumb(breadcrumb) {
                // Strip ansi color codes from sentry messages.
                if (breadcrumb.message && typeof breadcrumb.message === 'string') {
                    breadcrumb.message = kolorist.stripColors(breadcrumb.message);
                }
                return breadcrumb;
            },
            integrations: [],
        });
    }

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

        await locking.init(config, state);

        try {
            if (config.concurrency === 0) {
                await sequential_run(config, state);
            } else {
                await parallel_run(config, state);
            }
        } finally {
            // We may have printed a lot of things to stdout making it hard to see
            // failed tests and their stack traces. Therefore we re-print all stack
            // traces of all failed tests at the end.
            if (config.verbose || config.ci || config.status_interval) {
                const errored = tasks.filter(t => t.status === 'error' && (!t.expectedToFail || config.expect_nothing));
                for (const task of errored) {
                    const group = resultByTaskGroup.get(task.group);
                    assert(group);

                    // Don't re-print errors if the test is marked as flaky
                    if (group.status !== 'flaky' && shouldShowError(config, task)) {
                        await output.logTaskError(config, task);
                    }
                }
            }
            output.finish(config, state);
        }

        output.logVerbose(config, 'Test run complete, shutting down locks & email connections ...');

        const lockPromise = timeoutPromise(
            config, locking.shutdown(config, state),
            {message: 'locking shutdown', warning: true});
        const emailPromise = timeoutPromise(
            config, email.shutdown(config),
            {message: 'email shutdown', warning: true});
        await Promise.all([lockPromise, emailPromise]);

        output.logVerbose(config, 'lock & email shutdown complete');
    } finally {
        if (config.afterAllTests) {
            output.logVerbose(config, 'running custom per-project teardown ...');
            await timeoutPromise(
                config, config.afterAllTests(config, initData),
                {message: 'afterAllTests function', warning: true});
        }
    }

    const now = new Date();
    const test_end = now.getTime();

    output.logVerbose(config, `Test ended at ${utils.localIso8601(now)}, crafting results`);
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
    onTeardown,
    run,
};
