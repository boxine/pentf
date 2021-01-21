const { parentPort, workerData } = require('worker_threads');
const { importFile, loadSuite } = require('./loader');
const output = require('./output');

/**
 * Only for type safety
 * @param {import('./internal').WorkerMessages} message
 */
const postMessage = (message) => parentPort.postMessage(message);

parentPort.on('message', message => {
    console.log(message);
});

(async () => {
    const { task, config, fileName, name } = workerData;
    postMessage({
        type: 'log',
        message: "bo " + new Date().getTime() / 1000
    });

    // 1. Discover all test cases inside the requested file
    const mod = await importFile(fileName, config.moduleType);

    /** @type {import('./runner').TestCase[]} */
    const testCases = [];
    if (typeof mod.suite === 'function') {
        // testCases.push(...loadSuite(fileName, name, m.suite));
    } else if (typeof mod.run === 'function') {
        testCases.push({
            name,
            fileName,
            run: mod.run,
            expectedToFail: mod.expectedToFail,
            skip: mod.skip,
            resources: mod.resources,
        });
    }

    if (!testCases.length) {
        const message = output.color(config, 'red', `No tests found in file "${fileName}", skipping.`);
        postMessage({
            type: 'log',
            message
        });
    }

    // 2. Optional: Run specified test case
    let error = null;
    if (task) {
        const tc = mod.run
            ? testCases[0]
            : testCases.find(tc => tc.name === task.name);

        try {
            await tc.run(config);
        } catch (err) {
            error = err;
        }
    }

    postMessage({ type: 'done', error });
})();
