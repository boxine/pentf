const {AsyncResource} = require('async_hooks');
const path = require('path');
const {Worker} = require('worker_threads');

/**
 * Remove non-serializable properties
 * @param {object} obj
 */
function serialize(obj) {
    let out = {};
    for (const k in obj) {
        if (typeof obj[k] !== 'function') {
            out[k] = obj[k];
        }
    }
    return out;
}

const kTaskInfo = Symbol('kTaskInfo');

// Necessary for async stack traces, see:
// https://nodejs.org/api/async_hooks.html#async-resource-worker-pool
class WorkerPoolTaskInfo extends AsyncResource {
    constructor(callback) {
        super('WorkerPoolTaskInfo');
        this.callback = callback;
    }

    done(err, result) {
        this.runInAsyncScope(this.callback, null, err, result);
        this.emitDestroy(); // `TaskInfo`s are used only once.
    }
}

/**
 * @param {import('./runner').TaskConfig} config
 * @param {import('./runner').Task} task
 * @param {*} callback
 */
function run_in_worker(config, task, callback) {
    const raw_config = serialize(config);

    const worker = new Worker(path.resolve(__dirname, 'run_worker_entry.js'), {
        workerData: {
            config: raw_config,
            fileName: task.tc.fileName
        }
    });
    worker.on('message', message => {
        console.log('worker__message', message);
        if (message.type === 'done') {
            worker[kTaskInfo].done(null, message);
            worker[kTaskInfo] = null;
        }
    });
    worker.on('error', err => {
        if (worker[kTaskInfo]) worker[kTaskInfo].done(err, null);
    });

    worker[kTaskInfo] = new WorkerPoolTaskInfo(callback);
    worker.postMessage('start');
}

module.exports = {
    run_in_worker,
};
