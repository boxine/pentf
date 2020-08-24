const {Worker, isMainThread, parentPort, workerData} = require('worker_threads');
const {importFile} = require('./loader');

async function start() {
    let status = 'error';
    try {
        const {config, fileName} = workerData;
        /** @type {import('./runner').TestCase} */
        const m = (await importFile(fileName));
        await m.run(config);
        status = 'success';
    } catch(err) {
        status = 'error';
    } finally {
        parentPort.postMessage({ event: 'done', status });
    }
}

parentPort.on('message', message => {
    if (message === 'start') start();
});
