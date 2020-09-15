const path = require('path');
const output = require('output');
const {importFile} = require('../loader');
const {promisify} = require('util');
const mkdirp = require('mkdirp');
const {timeoutPromise} = require('./promise_utils');

/**
 * @typedef {Omit<import('./runner').TestCase, 'name' | 'run'>} TestOptions
 */

/**
 * @typedef {{(name: string, test: (config: import('./runner').TaskConfig) => Promise<void> | void, options?: TestOptions): void, only: (name: string, test: (config: import('./runner').TaskConfig) => Promise<void> | void, options?: TestOptions): void} TestFn
 */

/**
 * @typedef {{(name: string, callback: () => void): void, only: (name: string, callback: () => void): void} DescribeFn
 */

/**
 * @typedef {(test: TestFn, suite: DescribeFn) => void} SuiteBuilder
 */

/**
 * @param {string} fileName
 * @param {string} suiteName
 * @param {SuiteBuilder} builder
 * @private
 */
function loadSuite(fileName, suiteName, builder) {
    const tests = [];
    const only = [];
    let onlyInScope = false;
    let skipInScope = false;
    const groups = [suiteName];
    let i = 0;

    const skipFn = () => true;

    /**
     * Create a test case
     * @param {string} description
     * @param {(config: import('./config').Config) => Promise<void>} run
     * @param {TestOptions} options
     */
    function test(description, run, options = {}) {
        const arr = onlyInScope ? only : tests;
        arr.push({
            description,
            name: `${groups.join('>')}_${i++}`,
            run,
            skip: skipInScope ? skipFn : options.skip,
            path: fileName,
            ...options,
        });
    }

    /**
     * Only run this test case in the current file
     * @param {string} description
     * @param {(config: import('./config').Config) => Promise<void>} run
     * @param {TestOptions} options
     */
    test.only = (description, run, options = {}) => {
        only.push({
            description,
            name: `${groups.join('>')}_${i++}`,
            run,
            skip: skipInScope ? skipFn : options.skip,
            path: fileName,
            ...options,
        });
    };

    /**
     * Skip this test case
     * @param {string} description
     * @param {(config: import('./config').Config) => Promise<void>} run
     * @param {TestOptions} options
     */
    test.skip = (description, run, options = {}) => {
        const arr = onlyInScope ? only : tests;
        arr.push({
            description,
            name: `${groups.join('>')}_${i++}`,
            run,
            skip: skipFn,
            path: fileName,
            ...options,
        });
    };

    /**
     * Create a group for test cases
     * @param {string} description
     * @param {() => void} callback
     */
    function describe(description, callback) {
        groups.push(description);
        callback();
        groups.pop();
    }

    /**
     * Only run the test cases inside this group
     * @param {string} description
     * @param {() => void} callback
     */
    describe.only = (description, callback) => {
        onlyInScope = true;
        groups.push(description);

        callback();

        onlyInScope = false;
        groups.pop();
    };

    /**
     * Skip this group of test cases
     * @param {string} description
     * @param {() => void} callback
     */
    describe.skip = (description, callback) => {
        skipInScope = true;
        groups.push(description);

        callback();

        skipInScope = false;
        groups.pop();
    };

    builder(test, describe);
    return only.length > 0 ? only : tests;
}

function createNodeLauncher() {
    const name = 'node-launcher';

    return {
        name,
        async onLoad(config, files) {
            const test_cases = [];

            for (const fileName of files) {
                const basename = path.basename(fileName, path.extname(fileName));
                const tc = await importFile(fileName);
                if (typeof tc.suite === 'function') {
                    test_cases.push(...loadSuite(fileName, basename, tc.suite));
                } else {
                    // ESM modules are readonly, so we need to create our own writable
                    // object.
                    test_cases.push({...tc, name: basename, fileName, launcher: name});
                }
            }

            return test_cases;
        },
        async onTestDone(config, task) {
            if (task.status === 'error') {
                if (config.take_screenshots) {
                    output.logVerbose(
                        config,
                        `[task] Taking ${config._browser_pages.length} screenshots for task` +
                        ` #${task._runner_task_id} (${task.name})`);
                    try {
                        const screenshotPromise = Promise.all(config._browser_pages.map(
                            async (page, i) => {
                                await promisify(mkdirp)(config.screenshot_directory);
                                const fn = path.join(
                                    config.screenshot_directory, `${task.id || task.name}-${i}.png`);
                                return await page.screenshot({
                                    path: fn,
                                    type: 'png',
                                    fullPage: true,
                                });
                            })
                        );
                        task.error_screenshots = await timeoutPromise(
                            config, screenshotPromise,
                            {timeout: 10000, message: 'screenshots took too long'});
                    } catch(e) {
                        output.log(
                            config,
                            `INTERNAL ERROR: failed to take screenshot of #${task.id} (${task.name}): ${e}`);
                    }
                }
            }
        }
    };
}

module.exports = {
    createNodeLauncher,
};
