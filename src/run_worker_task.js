const {AsyncResource} = require('async_hooks');
const {EventEmitter} = require('events');
const path = require('path');
const {Worker} = require('worker_threads');

const kTaskInfo = Symbol('kTaskInfo');
const kWorkerFreedEvent = Symbol('kWorkerFreedEvent');

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
 *
 * @param {import('./runner').TaskConfig} config
 * @param {import('./runner').Task} task
 * @param {*} callback
 */
function run_in_worker(config, task, callback) {
    // Remove non-serializable properties to be able to transfer it
    // to a worker
    let raw_config = {};
    for (const k in config) {
        if (typeof config[k] !== 'function') {
            raw_config[k] = config[k];
        }
    }
    const worker = new Worker(path.resolve(__dirname, 'run_worker_entry.js'), {
        workerData: {
            config: raw_config,
            fileName: task.tc.fileName
        }
    });
    worker.on('message', result => {
        worker[kTaskInfo].done(null, result);
        worker[kTaskInfo] = null;
        // this.freeWorkers.push(worker);
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
