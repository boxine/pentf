const path = require('path');
const minimatch = require('minimatch');
const chokidar = require('chokidar');

const output = require('./output');
const {loadTests, applyTestFilters} = require('./loader');

/**
 * Delete a file from node's module cache. Only CJS is supported for now.
 * @param {string} fileName Absolute path to file
 */
function removeFromModuleCache(fileName) {
    delete require.cache[fileName];
}

/**
 * @param {import('./config').Config} config
 * @param {string[]} patterns
 * @param {(test_cases: import('./runner').TestCase[]) => Promise<void>} onChange
 */
async function createWatcher(config, onChange) {
    const patterns = [...config.watch_files, config.testsGlob]
        .map(pattern => path.join(config._testsDir, pattern));

    const watcher = chokidar.watch(patterns, {
        cwd: config._rootDir,
        ignoreInitial: true,
        absolute: true,
    });

    watcher.on('ready', () => {
        if (!config.ci) console.clear();
        console.log('Waiting for file changes...');
    });

    watcher.on('unlink', fileOrDir => {
        const absolute = path.join(config._rootDir, fileOrDir);
        removeFromModuleCache(absolute);
    });

    let isRunning = false;
    watcher.on('change', async fileOrDir => {
        // Bail out if there is a run in progress.
        // TODO: Add proper cancellation for pending runs.
        if (isRunning) {
            return;
        }

        const absolute = path.join(config._rootDir, fileOrDir);
        removeFromModuleCache(absolute);

        // Check if we have a test file and if yes, if that file
        // matches the current filter set.
        let test_cases = await loadTests(config, config._testsDir, config.testsGlob);
        if (minimatch(absolute, path.join(config._testsDir, config.testsGlob))) {
            test_cases = await applyTestFilters(config, test_cases);
            test_cases = test_cases.filter(tc => tc.fileName === absolute);
        }

        // Bail out if there are no tests to run
        if (test_cases.length === 0) {
            return;
        }

        isRunning = true;

        if (!config.ci) console.clear();
        try {
            const suffix = output.color(config, 'lightCyan', 'Updated');
            output.log(config, `${suffix} ${fileOrDir}`);
            await onChange(test_cases);
        } catch (err) {
            console.log(err);
        }
        isRunning = false;
    });
}

module.exports = {
    createWatcher,
};
