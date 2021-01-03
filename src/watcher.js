const path = require('path');
const minimatch = require('minimatch');
const chokidar = require('chokidar');
const readline = require('readline');

const output = require('./output');
const utils = require('./utils');
const {loadTests, applyTestFilters} = require('./loader');

/**
 * Delete a file from node's module cache. Only CJS is supported for now.
 * @param {string} fileName Absolute path to file
 */
function removeFromModuleCache(fileName) {
    delete require.cache[fileName];
}

/**
 *
 * @param {import('./config').Config} config
 * @param {string} key
 * @param {string} description
 */
function keyHint(config, key, description) {
    return output.color(config, 'dim', 'Press ') +
        key + output.color(config, 'dim', ' ' + description);
}

/**
 *
 * @param {import('./config').Config} config
 */
function watchFooter(config) {
    let out = '\n';
    if (config.debug) {
        out += output.color(config, 'reset', 'Debug mode: ');
        out += output.color(config, 'yellow', 'enabled') + '\n\n';
    }

    if (config.filter) {
        out += output.color(config, 'reset', 'Active filter: ');
        out += output.color(config, 'yellow', config.filter) + '\n';
        out += `${keyHint(config, 'c', 'to clear active filters')}\n\n`;
    }

    out += [
        keyHint(config, 'a', 'to re-run all tests'),
        keyHint(config, 'p', 'to search by file pattern'),
        keyHint(config, 'd', `to ${config.debug ? 'disable' : 'enable'} debug mode`),
        keyHint(config, 'q', 'to quit watch mode'),
        keyHint(config, 'Enter', 'to re-run current tests'),
    ].join('\n');

    return out;
}

/**
 *
 * @param {import('./config').Config} config
 * @param {WatchState} state
 * @param {import('./runner').TestCase[]} test_cases
 */
function renderSearch(config, state, test_cases) {
    if (!config.ci) console.clear();

    const { file_pattern, cursor_pos } = state;

    const suffix = 'pattern ›';
    const label = output.color(config, 'dim', suffix);
    let input = '';
    if (!file_pattern) {
        input = output.color(config, 'inverse', ' ');
    } else {
        input = file_pattern.slice(0, cursor_pos) +
            output.color(config, 'inverse', file_pattern.slice(cursor_pos, cursor_pos + 1) || ' ') +
            file_pattern.slice(cursor_pos + 1);
    }

    let results = [];
    if (file_pattern.length) {
        if (!utils.isValidRegex(file_pattern)) {
            results.push(output.color(config, 'red', 'Pattern contains invalid characters'));
        } else {
            const len = test_cases.length;
            if (len > 10) {
                test_cases = test_cases.slice(0, 10);
            }
            results = test_cases.map((tc, i) => {
                if (state.selection_active && state.selected_row === i) {
                    return output.color(config, 'dim', '- ') +
                        output.color(config, 'inverse', output.color(config, 'yellow', tc.name));
                }

                let name = output.color(config, 'dim', tc.name);
                const match = tc.name.match(new RegExp(file_pattern));
                if (match) {
                    name = output.color(config, 'dim', tc.name.slice(0, match.index)) +
                        tc.name.slice(match.index, match.index + match[0].length) +
                        output.color(config, 'dim', tc.name.slice(match.index + match[0].length));
                }

                return `  ${name}`;
            });

            if (len > 10) {
                results.push(`  ...and ${len - 10} more`);
            } else if (len === 0) {
                results.push(output.color(config, 'yellow', 'Could not find any test files matching that pattern'));
            }
        }
    } else {
        results.push(output.color(config, 'yellow', 'Start typing to filter by filename'));
    }

    const footer = [
        keyHint(config, 'Esc', 'to exit pattern mode'),
        keyHint(config, 'Enter', 'to apply pattern')
    ].join('\n');

    output.log(config, `${label} ${input}\n\n${results.join('\n')}\n\n${footer}`);
}

/**
 * @param {import('./config').Config} config
 */
function renderDefault(config) {
    if (!config.ci) console.clear();
    output.log(config, 'Waiting for file changes...');
    output.log(config, watchFooter(config));
}

/**
 * @typedef {{running: boolean, last_changed_file: string, current_view: 'default' | 'pattern', file_pattern: string, cursor_pos: number, selected_row: number, selection_active: boolean, selected_file: null | string }} WatchState
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
    state.running = true;

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
        state.running = false;
        return;
    }

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

    output.log(config, watchFooter(config));
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

    watcher.on('ready', () => renderDefault(config, watchState));

    watcher.on('unlink', fileOrDir => {
        const absolute = path.join(config.rootDir, fileOrDir);
        removeFromModuleCache(absolute);
    });

    /** @type {WatchState} */
    const watchState = {
        last_changed_file: '',
        current_view: 'default',
        cursor_pos: 0,
        selection_active: false,
        selected_row: 0,
        selected_file: null,
        file_pattern: '',
        running: false,
    };

    // Initialize keypress event listeners to stdin stream
    readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    /**
     * @param {{ name: string, sequence: string, ctrl: boolean, shift: boolean, meta: boolean }} key
     */
    async function onKeyPress(key) {
        if (watchState.running) {
            return;
        } else if (watchState.current_view === 'default') {
            if (key.name === 'q') {
                process.exit(0);
            } else if (key.name === 'return') {
                await scheduleRun(config, watchState, onChange);
            } else if (key.name === 'a') {
                config.filter = null;
                await scheduleRun(config, watchState, onChange);
            } else if (key.name === 'c') {
                config.filter = null;
                watchState.file_pattern = '';
                watchState.selected_file = null;
                watchState.selected_row = 0;
                watchState.selection_active = false;
                renderDefault(config);
            } else if (key.name === 'd') {
                const enabled = !config.debug;
                config.headless = !enabled;
                config.debug = enabled;
                config.devtools = enabled;
                config.devtools_preserve = enabled;
                config.keep_open = enabled;
                config.forward_console = enabled;
                renderDefault(config);
            } else if (key.name === 'p') {
                watchState.current_view = 'pattern';
                const test_cases = await loadTests({ ...config, filter: watchState.file_pattern }, config.testsGlob);
                renderSearch(config, watchState, test_cases);
            }
        } else {
            if (key.name === 'return') {
                watchState.current_view = 'default';
                config.filter = watchState.selection_active && watchState.selected_file !== null
                    ? `^${utils.regexEscape(watchState.selected_file)}$`
                    : watchState.file_pattern;

                renderDefault(config, watchState);
                await scheduleRun(config, watchState, onChange);
            } else if (key.name === 'escape' && !watchState.selection_active) {
                watchState.current_view = 'default';
                renderDefault(config, watchState);
            } else {
                let { cursor_pos, file_pattern, selected_row, selection_active, selected_file } = watchState;
                if (key.name === 'up') {
                    selected_row = selection_active
                        ? selected_row - 1
                        : 10;
                    selection_active = true;
                } else if (key.name === 'down') {
                    selected_row = selection_active
                        ? selected_row + 1
                        : 0;
                    selection_active = true;
                } else if (key.name === 'escape') {
                    selection_active = false;
                } else {
                    selection_active = false;
                    selected_file = null;

                    if (key.name === 'backspace') {
                        file_pattern = utils.removeAt(file_pattern, cursor_pos - 1, 1);
                        cursor_pos--;
                    } else if (key.name === 'delete') {
                        file_pattern = utils.removeAt(file_pattern, cursor_pos, 1);
                    } else if (key.name === 'left') {
                        cursor_pos--;
                    } else if (key.name === 'right') {
                        cursor_pos++;
                    } else if (!key.ctrl && !key.meta) {
                        cursor_pos++;
                        file_pattern =
                            file_pattern.slice(0, cursor_pos) +
                            key.sequence +
                            file_pattern.slice(cursor_pos);
                    }
                }

                let test_cases = [];
                if (file_pattern.length && utils.isValidRegex(file_pattern)) {
                    test_cases = await loadTests({ ...config, filter: file_pattern}, config.testsGlob);
                    if (selection_active) {
                        const selected = test_cases[selected_row];
                        if (selected) {
                            selected_file = selected.name;
                        }
                    }
                }

                watchState.cursor_pos = Math.max(0, Math.min(file_pattern.length, cursor_pos));
                watchState.file_pattern = file_pattern;
                watchState.selection_active = selection_active;
                watchState.selected_row = Math.max(0, Math.min(selected_row, test_cases.length - 1));
                watchState.selected_file = selected_file;
                renderSearch(config, watchState, test_cases);
            }
        }
    }

    // Only for tests, can't simulate keycodes without a proper TTY
    if (!process.stdout.isTTY) {
        process.stdin.on('data', async e => {
            if (Buffer.isBuffer(e)) {
                switch (e.toString()) {
                case String.fromCharCode(13):
                    await onKeyPress({name: 'return'});
                    break;
                case String.fromCharCode(27):
                    await onKeyPress({name: 'escape'});
                    break;
                case '↓':
                    await onKeyPress({name: 'down'});
                    break;
                default:
                    await onKeyPress({name: e.toString(), sequence: e.toString()});
                }
            }
        });
    }

    process.stdin.on('keypress', async (_, key) => {
        await onKeyPress(key);
    });

    watcher.on('change', async fileOrDir => {
        watchState.last_changed_file = fileOrDir;
        await scheduleRun(config, watchState, onChange);
    });
}

module.exports = {
    createWatcher,
};
