import { strict as assert } from 'assert';

import * as output from './output';
import {wait} from './utils';
import * as external_locking from './external_locking';
import { Config } from './config';
import { RunnerState, Task } from './runner';

/**
 * @param {import('./config').Config} config
 * @param {import('./runner').Task} task
 * @private
 */
export function annotateTaskResources(config: Config, task: Task) {
    if (config.no_locking) {
        return;
    }

    for (const r of task.resources) {
        assert(/^[-A-Za-z_0-9]+$/.test(r), `Invalid resource name in task ${task.id}: ${JSON.stringify(r)}`);
    }
}

/**
 * @param {import('./config').Config} config
 * @param {import('./runner').RunnerState} state
 * @private
 */
export async function init(config: Config, state: RunnerState) {
    assert(config);
    assert(state);
    state.locks = new Set();
    external_locking.init(config, state);
}

/**
 * @param {import('./config').Config} config
 * @param {import('./runner').RunnerState} state
 * @private
 */
export async function shutdown(config: Config, state: RunnerState) {
    external_locking.shutdown(config, state);
    assert.equal(
        state.locks!.size, 0,
        `Still got some locks on shutdown: ${Array.from(state.locks!).sort().join(',')}`);
}

/**
 * Aquire locks on resources
 * @param {import('./config').Config} config
 * @param {import('./runner').RunnerState} state
 * @param {import('./runner').Task} task
 */
export async function acquire(config: Config, state: RunnerState, task: Task) {
    if (config.no_locking) return true;

    assert(task);
    if (! task.resources.length) {
        return true;
    }

    const {locks} = state;
    assert(locks);
    if (task.resources.some(r => locks!.has(r))) {
        if (config.locking_verbose || config.log_file) {
            const failed = task.resources.filter(r => locks!.has(r));

            output.logVerbose(config, `[locking] ${task.id}: Failed to acquire ${failed.join(',')}`);
        }
        return false;
    }

    if (! config.no_external_locking) {
        try {
            const acquireRes = await external_locking.externalAcquire(config, task.resources, 40000);
            if (acquireRes !== true) {
                if (config.locking_verbose || config.log_file) {
                    output.logVerbose(config,
                        `[exlocking] ${task.id}: Failed to acquire ${acquireRes.resource}`  +
                        `, held by ${acquireRes.client}, expires in ${acquireRes.expireIn} ms`);
                }
                return false;
            }
        } catch(e) {
            if (config.locking_verbose || config.log_file) {
                output.logVerbose(config, `[exlocking] Failed to acquire locks for ${task.id}: ${e.stack}`);
            }
            return false;
        }
    }

    for (const r of task.resources) {
        locks!.add(r);
    }
    if (config.locking_verbose || config.log_file) {
        output.logVerbose(config, `[locking] ${task.id}: Acquired ${task.resources.join(',')}`);
    }
    return true;
}

/**
 * @param {import('./config').Config} config
 * @param {import('./runner').RunnerState} state
 * @param {import('./runner').Task} task
 */
export async function acquireEventually(config: Config, state: RunnerState, task: Task) {
    if (config.no_locking) return true;
    if (config.locking_verbose || config.log_file) {
        output.logVerbose(config, `[locking] ${task.id}: Trying to eventually acquire ${task.resources.join(',')}`);
    }
    let waitTime = 50;
    while (! await acquire(config, state, task)) {
        await wait(waitTime);
        waitTime = Math.min(10000, waitTime * 2);
    }
    return true;
}

/**
 * Release locks on resources
 * @param {import('./config').Config} config
 * @param {import('./runner').RunnerState} state
 * @param {import('./runner').Task} task
 */
export async function release(config: Config, state: RunnerState, task: Task) {
    if (config.no_locking) return true;
    if (! task.resources.length) {
        return;
    }

    if (! config.no_external_locking) {
        try {
            const response = await external_locking.externalRelease(config, task.resources);
            if (response !== true) {
                if (config.locking_verbose || config.log_file) {
                    output.logVerbose(config,
                        `[exlocking] ${task.id}: Failed to release ${response.resource}` +
                        `, held by ${response.client} expires in ${response.expireIn} ms`);
                }
            }
        } catch(e) {
            output.log(config, `[exlocking] Failed to release for ${task.id}: ${e.stack}`);
        }
    }

    const {locks} = state;
    for (const r of task.resources) {
        assert(locks!.has(r), `Trying to release ${r} for ${task.id}, but not in current locks ${Array.from(locks!).sort().join(',')}`);
        locks!.delete(r);
    }
    if (config.locking_verbose || config.log_file) {
        output.logVerbose(config, `[locking] ${task.id}: Released ${task.resources.join(',')}`);
    }
}

/**
 * @param {import('./config').Config} config
 * @param {import('./runner').Task[]} tasks
 * @private
 */
export function listConflicts(config: Config, tasks: Task[]) {
    const tasksByResource = new Map<string, Task[]>();
    for (const t of tasks) {
        for (const r of t.resources) {
            let tasks = tasksByResource.get(r);
            if (!tasks) {
                tasks = [];
                tasksByResource.set(r, tasks);
            }
            tasks.push(t);
        }
    }

    let anyConflicts = false;
    for (const [resource, tasks] of tasksByResource) {
        if (tasks.length === 1) continue;

        anyConflicts = true;
        output.log(config, `${resource}: ${tasks.map(t => t.id).join(' ')}`);
    }
    if (! anyConflicts) {
        output.log(config, 'No resource conflicts found');
    }
}

