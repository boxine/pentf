// Functions to output the current state.
// For functions to render the state _after_ the tests have finished, look in render.js .
const assert = require('assert');
const readline = require('readline');
const diff = require('diff');
const kolorist = require('kolorist');

const utils = require('./utils');
const {resultCountString} = require('./results');

const STATUS_STREAM = process.stderr;

var last_state;

function clean(config) {
    assert(config);
    if (!STATUS_STREAM.isTTY) return;
    if (config.no_clear_line) return;
    readline.cursorTo(STATUS_STREAM, 0);
    readline.clearLine(STATUS_STREAM, 0);
}

function status(config, state) {
    if (config.quiet) return;
    assert(state.tasks);

    last_state = state;

    const {tasks} = state;
    const running = tasks.filter(s => s.status === 'running');
    const running_count = running.length;
    const done_count = utils.count(tasks, t => (t.status === 'success') || (t.status === 'error'));
    const failed_count = utils.count(tasks, t => t.status === 'error');
    const skipped_count = utils.count(tasks, t => t.status === 'skipped');
    const failed_str = failed_count > 0 ? color(config, 'red', `${failed_count} failed, `) : '';

    // Fit output into one line
    // Instead of listing all running tests  (aaa bbb ccc), we write (aaa  +2).
    const terminal_width = STATUS_STREAM.getWindowSize ? STATUS_STREAM.getWindowSize()[0] : Infinity;
    let status_str;
    for (let running_show = running.length;running_show >= 0;running_show--) {
        const running_str = (
            running.slice(0, running_show).map(({tc}) => tc.name).join(' ')
            + (running_show < running.length ? '  +' + (running.length - running_show) : '')
        );
        status_str = (
            `${done_count}/${tasks.length - skipped_count} done, ` +
            `${failed_str}${running_count} running (${running_str})`);

        if (status_str.length < terminal_width) {
            break; // Fits!
        }
    }

    clean(config);
    STATUS_STREAM.write(status_str);
    if (!STATUS_STREAM.isTTY || config.no_clear_line) {
        STATUS_STREAM.write('\n');
    }
}


function finish(config, state) {
    last_state = null;
    const {tasks} = state;
    assert(tasks);

    clean(config);

    if (tasks.length === 0 && config.filter) {
        STATUS_STREAM.write(`No test case found with filter: ${config.filter}\n`);
    }
    STATUS_STREAM.write(resultCountString(config, tasks) + '.\n');

    const skipped = tasks.filter(t => t.status === 'skipped');
    if (skipped.length > 0) {
        STATUS_STREAM.write(`Skipped ${skipped.length} tests (${skipped.map(s => s.name).join(' ')})\n`);
    }

    const expectedToFail = tasks.filter(t => t.expectedToFail && t.status === 'error');
    if (!config.expect_nothing && (expectedToFail.length > 0)) {
        STATUS_STREAM.write(`${expectedToFail.length} tests failed as expected (${expectedToFail.map(s => s.name).join(' ')}). Pass in -E/--expect-nothing to ignore expectedToFail declarations.\n`);
    }

    // Internal self-check
    const inconsistent = tasks.filter(t => !['success', 'error', 'skipped'].includes(t.status));
    if (inconsistent.length) {
        STATUS_STREAM.write(
            `INTERNAL ERROR: ${inconsistent.length} out of ${tasks.length} tasks` +
            ` are in an inconsistent state. First affected task is ${inconsistent[0].name}` +
            ` in state ${inconsistent[0].status}.`);
    }
}

function log(config, message) {
    if (config.logFunc) return config.logFunc(config, message);

    if (! config.concurrency) {
        console.log(message);  // eslint-disable-line no-console
        return;
    }

    if (last_state) {
        clean(config);
    }
    console.log(message); // eslint-disable-line no-console
    if (last_state) {
        status(config, last_state);
    }
}

function logVerbose(config, message) {
    if (!config.verbose) return;
    log(config, message);
}

/**
 * Indent string
 * @param {number} n Levels of indentation
 */
function indent(n) {
    return '  '.repeat(n);
}

/**
 * Convert a value into a formatted string that can be used for
 * comparisons. Contrary to `JSON.stringify(value, null, 2)` this
 * will sort object properties which is necessary to get a meaningful
 * diff.
 * @param {*} value Value to stringify
 * @returns {string}
 */
function stringify(value, level = 0) {
    if (typeof value === 'string') return `"${value}"`;
    if (
        typeof value === 'number'
        || typeof value === 'boolean'
        || value === undefined
        || value === null
    ) {
        return '' + value;
    }

    const start = indent(level + 1);
    const end = indent(level);
    
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const items = value
            .map(item => `${start}${stringify(item, level + 1)}`)
            .join(',\n');
        
        return `[\n${items},\n${end}]`;
    }

    const keys = Object.keys(value);
    if (!keys.length) return '{}';

    const items = keys
        .sort()
        .map(key => {
            return `${start}"${key}": ${stringify(value[key], level + 1)}`;
        })
        .join(',\n');
    
    return `{\n${items},\n${end}}`;
}

/**
 * Generates a diff to be printed in stdout
 * @param {*} config The pentf configuration object.
 * @param {Error} err The error to generate the diff from
 * @returns {string}
 */
function generateDiff(config, err) {
    assert(err);

    const showDiff = err
    && (
        // Chaijs adds this property if the diff should be shown. Assert
        // Will automatically append a diff to `err.stack` in strict mode.
        err.showDiff
            // If assert is not in strict mode or for some reason the diff
            // is missing, we will append our own nonetheless
            || !err.stack.slice(1).includes('+ expected')
    )
        // Check if actual and expected are the same type
        && Object.prototype.toString.call(err.actual) === Object.prototype.toString.call(err.expected)
        // We can't generate a diff if the expected value is not present
        && err.expected !== undefined;

    if (!showDiff) return '';

    // The "diff" package works on strings only
    const actual = stringify(err.actual);
    const expected = stringify(err.expected);

    // Append newline to prevent "No newline at end of file"
    // to be included in the generated patch
    const patch = diff.createPatch('string', actual + '\n', expected + '\n');

    // Remove patch meta block that's not relevant for us
    const lines = patch.split('\n').splice(5);

    const indent = '  ';
    const formatted = lines
        .map(line => {
            if (line[0] === '-') {
                return indent + color(config, 'red', line);
            } else if (line[0] === '+') {
                return indent + color(config, 'green', line);
            }
            return indent + line;
        })
        .join('\n');

    return `\n${formatted}\n`;
}

function color(config, colorName, str) {
    if (!config.colors) {
        return str;
    }

    const m = /^inverse-(.*)$/.exec(colorName);
    if (m) {
        colorName = m[1];
        assert(kolorist[colorName], `Unsupported color ${colorName}`);
        return kolorist.inverse(kolorist[colorName](str));
    }

    assert(kolorist[colorName], `Unsupported color ${colorName}`);
    return kolorist[colorName](str);
}

/**
 * Format the error 
 * @param {Error} err Error object to format
 */
function formatError(err) {
    return err.stack
        .split('\n')
        // Indent stack trace
        .map(line => '  ' + line)
        .join('\n');
}

module.exports = {
    color,
    finish,
    formatError,
    log,
    logVerbose,
    generateDiff,
    status,
    stringify,
};
