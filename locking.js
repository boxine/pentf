const assert = require('assert');

const output = require('./output');
const {wait} = require('./utils');


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
}

async function shutdown(config, state) {
    state.locks.length = 0;
    assert.equal(state.locks.size, 0, `Still got some locks on shutdown: ${Array.from(state.locks).sort().join(',')}`);
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
    while (! await acquire(config, state, task)) {
        await wait(100);
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

    const {locks} = state;
    for (const r of task.resources) {
        assert(locks.has(r), `Trying to release ${r} for ${task.id}, but not in current locks ${Array.from(locks).sort().join(',')}`);
        locks.delete(r);
    }
    if (config.locking_verbose) {
        output.log(config, `[locking] ${task.id}: Released ${task.resources.join(',')}`);
    }
}

module.exports = {
    acquire,
    acquireEventually,
    annotateTaskResources,
    init,
    shutdown,
    release,
};
