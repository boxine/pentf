const {parentPort, workerData} = require('worker_threads');
const {importFile} = require('./loader');

async function start() {
    try {
        const {config, fileName} = workerData;
        /** @type {import('./runner').TestCase} */
        const m = (await importFile(fileName));
        await m.run(config);

        parentPort.postMessage({
            type: 'task_end',
            status: 'success'
        });
    } catch(err) {
        parentPort.postMessage({
            type: 'task_end',
            status: 'error',
            err
        });
    } finally {
        parentPort.postMessage({ type: 'done' });
    }
}

parentPort.on('message', message => {
    if (message === 'start') start();
});
