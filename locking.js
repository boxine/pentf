const assert = require('assert');

const output = require('./output');
const {wait} = require('./utils');
const external_locking = require('./external_locking');


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

async function init(state) {
    assert(state);
    assert(state.config);
    state.locks = new Set();
    external_locking.init(state);
}

async function shutdown(config, state) {
    external_locking.shutdown(state);
    state.locks.length = 0;
    assert.equal(
        state.locks.size, 0,
        `Still got some locks on shutdown: ${Array.from(state.locks).sort().join(',')}`);
}

async function acquire(config, state, task) {
    if (config.no_locking) return true;

    assert(task);
    assert(task.resources);
    if (! task.resources.length) {
        if (config.locking_verbose) {
            output.log(config, `[locking] ${task.id}: Needs no resources`);
        }
        return true;
    }

    const {locks} = state;
    assert(locks);
    if (task.resources.some(r => locks.has(r))) {
        if (config.locking_verbose) {
            const failed = task.resources.filter(r => locks.has(r));

            output.log(config, `[locking] ${task.id}: Failed to acquire ${failed.join(',')}`);
        }
        return false;
    }

    if (! config.no_external_locking) {
        try {
            const acquireRes = await external_locking.externalAcquire(config, task.resources, 40000);
            if (acquireRes !== true) {
                if (config.locking_verbose) {
                    output.log(config,
                        `[exlocking] ${task.id}: Failed to acquire ${acquireRes.firstResource}`  +
                        `, held by ${acquireRes.client}, expires in ${acquireRes.expireIn} ms`);
                }
                return false;
            }
        } catch(e) {
            output.log(config, `[exlocking] Failed to acquire for ${task.id}: ${e.stack}`);
            return false;
        }
    }

    for (const r of task.resources) {
        locks.add(r);
    }
    if (config.locking_verbose) {
        output.log(config, `[locking] ${task.id}: Acquired ${task.resources.join(',')}`);
    }
    return true;
}

async function acquireEventually(config, state, task) {
    if (config.no_locking) return true;
    if (config.locking_verbose) {
        output.log(config, `[locking] ${task.id}: Trying to eventually acquire ${task.resources.join(',')}`);
    }
    let waitTime = 50;
    while (! await acquire(config, state, task)) {
        await wait(waitTime);
        waitTime = Math.min(10000, waitTime * 2);
    }
    return true;
}

async function release(config, state, task) {
    if (config.no_locking) return true;
    if (! task.resources.length) {
        if (config.locking_verbose) {
            output.log(config, `[locking] ${task.id}: No resources, nothing to release`);
        }
        return;
    }

    try {
        const response = await external_locking.externalRelease(config, task.resources);
        if (response !== true) {
            if (config.locking_verbose) {
                output.log(config,
                    `[exlocking] ${task.id}: Failed to release ${response.firstResource}` +
                    `, held by ${response.client} expires in ${response.expireIn} ms`);
            }
        }
    } catch(e) {
        output.log(config, `[exlocking] Failed to release for ${task.id}: ${e.stack}`);
    }

    const {locks} = state;
    for (const r of task.resources) {
        assert(locks.has(r), `Trying to release ${r} for ${task.id}, but not in current locks ${Array.from(locks).sort().join(',')}`);
        locks.delete(r);
    }
    if (config.locking_verbose) {
        output.log(config, `[locking] ${task.id}: Released ${task.resources.join(',')}`);
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
    annotateTaskResources,
    init,
    listConflicts,
    release,
    shutdown,
};
