const path = require('path');
const minimatch = require('minimatch');
const chokidar = require('chokidar');
const readline = require('readline');

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
 * @typedef {{running: boolean, last_changed_file: string}} WatchState
 */

/**
 * @param {import('./config').Config} config
 * @param {WatchState} state
 * @param {(test_cases: import('./runner').TestCase[]) => Promise<void>} onChange
 */
async function scheduleRun(config, state, onChange) {
    // Bail out if there is a run in progress.
    // TODO: Add proper cancellation for pending runs.
    if (state.running) {
        return;
    }

    const absolute = path.join(config.rootDir, state.last_changed_file);
    if (state.last_changed_file) {
        removeFromModuleCache(absolute);
    }

    let test_cases = await loadTests(config, config.testsGlob);
    test_cases = await applyTestFilters(config, test_cases);
    if (minimatch(absolute, path.join(config.rootDir, config.testsGlob))) {
        test_cases = test_cases.filter(tc => tc.fileName === absolute);
    }

    // Bail out if there are no tests to run
    if (test_cases.length === 0) {
        return;
    }

    state.running = true;

    if (!config.ci) console.clear();
    try {
        if (state.last_changed_file) {
            const suffix = output.color(config, 'lightCyan', 'Updated');
            output.log(config, `${suffix} ${state.last_changed_file}`);
        } else {
            const suffix = output.color(config, 'lightCyan', 'Re-Run');
            output.log(config, `${suffix} tests`);
        }
        await onChange(test_cases);
    } catch (err) {
        console.log(err);
    }
    state.running = false;
}

/**
 * @param {import('./config').Config} config
 * @param {string[]} patterns
 * @param {(test_cases: import('./runner').TestCase[]) => Promise<void>} onChange
 */
async function createWatcher(config, onChange) {
    const patterns = [...config.watch_files, config.testsGlob].map(pattern =>
        path.join(config.rootDir, pattern)
    );

    const watcher = chokidar.watch(patterns, {
        cwd: config.rootDir,
        ignoreInitial: true,
        absolute: true,
    });

    watcher.on('ready', () => {
        if (!config.ci) console.clear();
        console.log('Waiting for file changes...');
    });

    watcher.on('unlink', fileOrDir => {
        const absolute = path.join(config.rootDir, fileOrDir);
        removeFromModuleCache(absolute);
    });

    /** @type {WatchState} */
    const watchState = {
        last_changed_file: '',
        running: false,
    };

    // Initialize keypress event listeners to stdin stream
    readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    // Only for tests, can't simulate keycodes without a proper TTY
    process.stdin.on('data', async e => {
        if (Buffer.isBuffer(e) && e.toString() === String.fromCharCode(13) && !watchState.running) {
            await scheduleRun(config, watchState, onChange);
        }
    });

    process.stdin.on('keypress', async (_, key) => {
        if (key.name === 'return' && !watchState.running) {
            await scheduleRun(config, watchState, onChange);
        }
    });

    watcher.on('change', async fileOrDir => {
        watchState.last_changed_file = fileOrDir;
        await scheduleRun(config, watchState, onChange);
    });
}

module.exports = {
    createWatcher,
};
