const assert = require('assert').strict;

const output = require('./output');
const {wait} = require('./utils');
const external_locking = require('./external_locking');

/**
 * @typedef {{resource: string, client: string, expireIn: number}} Lock
 */

/**
 * @typedef {{locks: Set<string>, by_task: Map<string, Set<string>>, pending: Set<string>}} LockingState
 */

function annotateTaskResources(config, task) {
    if (config.no_locking) {
        return;
    }

    const {tc} = task;
    if (tc.resources) {
        for (const r of tc.resources) {
            assert(/^[-A-Za-z_0-9]+$/.test(r), `Invalid resource name in task ${task.id}: ${JSON.stringify(r)}`);
        }
        task.resources = tc.resources;
    } else {
        task.resources = [`test_${tc.name}`];
    }
}

/**
 * @param {import('./runner').RunnerState} state 
 */
async function init(state) {
    assert(state);
    assert(state.config);
    state.locking = {
        locks: new Set(),
        by_task: new Map(),
        pending: new Set(),
    };
    external_locking.init(state);
}

/**
 * @param {import('./config').Config} config
 * @param {import('./runner').RunnerState} state 
 */
async function shutdown(config, state) {
    external_locking.shutdown(state);
    assert.equal(
        state.locking.locks.size, 0,
        `Still got some locks on shutdown: ${Array.from(state.locking.locks).sort().join(',')}`);
}

/**
 * Aquire locks on resources
 * @param {import('./config').Config} config 
 * @param {import('./runner').RunnerState} state 
 * @param {import('./runner').Task} task 
 */
async function acquire(config, state, task) {
    if (config.no_locking) return true;

    assert(task);
    assert(task.resources);
    if (! task.resources.length) {
        return true;
    }

    assert(state.locking);

    const {locks, by_task, pending} = state.locking;
    if (task.resources.some(r => locks.has(r))) {
        if (config.locking_verbose) {
            const failed = task.resources.filter(r => locks.has(r));

            output.log(config, `[locking] ${task.id}: Failed to acquire ${failed.join(',')}`);
        }
        return false;
    }

    if (! config.no_external_locking) {
        task.resources.forEach(r => pending.add(r));
        try {
            // TODO: There is no guarantee that all locking attempts are successful.
            // I have the suspicion that only some of those may be acquired and if
            // everybody has a lock someone else needs, we will starve each other indefinitely
            const acquireRes = await external_locking.externalAcquire(config, task.resources, 40000);
            if (acquireRes !== true) {
                if (config.locking_verbose) {
                    output.log(config,
                        `[exlocking] ${task.id}: Failed to acquire ${acquireRes.resource}`  +
                        `, held by ${acquireRes.client}, expires in ${acquireRes.expireIn} ms`);
                }
                return false;
            }
        } catch(e) {
            output.log(config, `[exlocking] Failed to acquire locks for ${task.id}: ${e.stack}`);
            return false;
        } finally {
            task.resources.forEach(r => pending.delete(r));
        }
    }

    if (! by_task.has(task.id)) {
        by_task.set(task.id, new Set());
    }
    const taskLocks = by_task.get(task.id);
    for (const r of task.resources) {
        locks.add(r);
        taskLocks.add(r);
    }
    if (config.locking_verbose) {
        output.log(config, `[locking] ${task.id}: Acquired ${task.resources.join(',')}`);
    }
    return true;
}

/**
 * @param {(waitTime: number) => Promise<boolean>} fn 
 */
async function runEventually(fn) {
    let waitTime = 50;
    while (! await fn(waitTime)) {
        await wait(waitTime);
        waitTime = Math.min(10000, waitTime * 2);
    }
}

/**
 * @param {import('./config').Config} config 
 * @param {import('./runner').RunnerState} state 
 * @param {import('./runner').Task} task 
 */
async function acquireEventually(config, state, task) {
    if (config.no_locking) return true;
    if (config.locking_verbose) {
        output.log(config, `[locking] ${task.id}: Trying to eventually acquire ${task.resources.join(',')}`);
    }
    return await runEventually(
        () => acquire(config, state, task)
    );
}

/**
 * @param {import('./config').Config} config 
 * @param {string[]} pool 
 * @param {number} [count=1] Amount of resources to lock from pool 
 * @returns {Promise<string[]>} Array with successfully locked ids
 */
async function acquireFromPool(config, pool, count = 1) {
    if (config.no_locking) return true;

    const taskId = config._taskId;

    if (config.locking_verbose) {
        output.log(config, `[locking] ${taskId}: Trying to eventually acquire one of ${pool.join(',')}`);
    }

    let out = [];
    await runEventually(
        async (waitTime) => {
            /** @type {LockingState} */
            const locking = config._locking;

            let currentLocks = locking.locks;
            if (! config.no_external_locking) {
                const used = await external_locking.externalList(config);
                currentLocks = new Set(used.map(l => l.resource));
            }

            const available = [];
            for (let i = 0; i < pool.length; i++) {
                const r = pool[i];
                if (! currentLocks.has(r) && ! locking.pending.has(r)) {
                    available.push(r);
                }
                
                if (available.length >= count) {
                    break;
                }
            }

            if (available.length < count) {
                if (config.locking_verbose) {
                    output.log(config, `[locking] Failed to acquire lock. Sleeping for ${waitTime}ms. Pool: ${pool.join(', ')}`);
                }
                return false;
            }

            const result = acquire(config, {locking}, {id: taskId, resources: available});
            if (result) {
                out = available;
            }
            return result;
        }
    );

    return out;
}

/**
 * Release locks on resources
 * @param {import('./config').Config} config 
 * @param {import('./runner').RunnerState} state 
 * @param {import('./runner').Task} task
 */
async function release(config, state, task) {
    if (config.no_locking) return true;
    if (! state.locking.by_task.has(task.id)) {
        return;
    }

    const {locks, by_task} = state.locking;
    const taskLocks = by_task.get(task.id);

    if (! config.no_external_locking) {
        try {
            const response = await external_locking.externalRelease(config, Array.from(taskLocks));
            if (response !== true) {
                if (config.locking_verbose) {
                    output.log(config,
                        `[exlocking] ${task.id}: Failed to release ${response.resource}` +
                        `, held by ${response.client} expires in ${response.expireIn} ms`);
                }
            }
        } catch(e) {
            output.log(config, `[exlocking] Failed to release for ${task.id}: ${e.stack}`);
        }
    }

    
    for (const r of taskLocks) {
        assert(locks.has(r), `Trying to release ${r} for ${task.id}, but not in current locks ${Array.from(taskLocks).sort().join(',')}`);
        locks.delete(r);
        taskLocks.delete(r);
    }
    if (config.locking_verbose) {
        output.log(config, `[locking] ${task.id}: Released ${Array.from(taskLocks).join(',')}`);
    }
}

function listConflicts(config, tasks) {
    const tasksByResource = new Map();
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

module.exports = {
    acquire,
    acquireEventually,
    acquireFromPool,
    annotateTaskResources,
    init,
    listConflicts,
    release,
    shutdown,
};
