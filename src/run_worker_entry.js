const {Worker, parentPort, workerData} = require('worker_threads');
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
        parentPort.postMessage({ type: 'done', status });
    }
}

parentPort.on('message', message => {
    if (message === 'start') start();
});
