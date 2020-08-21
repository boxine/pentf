import { StackFrame } from "errorstacks";
// Functions to output the current state.

import { Config } from "./config";
import { RunnerState, Task } from "./runner";

// For functions to render the state _after_ the tests have finished, look in render.js .
import { strict as assert } from 'assert';
import * as readline from 'readline';
import * as diff from 'diff';
import * as kolorist from 'kolorist';
import * as errorstacks from 'errorstacks';
import * as fs from 'fs';
import {isAbsolute} from 'path';
import {performance} from 'perf_hooks';

import * as utils from './utils';
import {getResults} from './results';

const STATUS_STREAM = process.stderr;

var last_state;

function clean(config: Config) {
    assert(config);
    if (!STATUS_STREAM.isTTY) return;
    if (config.no_clear_line) return;
    readline.cursorTo(STATUS_STREAM, 0);
    readline.clearLine(STATUS_STREAM, 0);
}

/**
 * @private
 */
export function status(config: Config, state: RunnerState) {
    if (config.quiet) return;
    assert(state.tasks);
    assert(state.resultByTaskGroup);

    last_state = state;

    const testResults = Array.from(state.resultByTaskGroup.values());
    const {errored, expectedToFail, skipped} = getResults(config, testResults);
    const {tasks} = state;

    const done = tasks.filter(t => t.status === 'error' || t.status === 'success');
    const running = tasks.filter(t => t.status === 'running');

    const failed_str = errored.length > 0 ? color(config, 'red', `${errored.length} failed, `) : '';
    const expected_fail_str = expectedToFail.length > 0 ? `${expectedToFail.length} failed as expected, ` : '';

    // Fit output into one line
    // Instead of listing all running tests  (aaa bbb ccc), we write (aaa  +2).
    const terminal_width = STATUS_STREAM.getWindowSize ? STATUS_STREAM.getWindowSize()[0] : Infinity;
    let status_str;
    for (let running_show = running.length;running_show >= 0;running_show--) {
        const running_str = (
            running.slice(0, running_show).map(task => task.name).join(' ')
            + (running_show < running.length ? '  +' + (running.length - running_show) : '')
        );
        status_str = (
            `${done.length}/${tasks.length - skipped.length} done, ` +
            `${failed_str}${expected_fail_str}${running.length} running (${running_str})`);

        if (status_str.length < terminal_width) {
            break; // Fits!
        }
    }

    // Don't pollute logs with noise if nothing has changed in "no clear line"-mode.
    const no_clear_line = !STATUS_STREAM.isTTY || config.no_clear_line;
    if (no_clear_line && state.last_logged_status === status_str) {
        return;
    }
    state.last_logged_status = status_str;

    clean(config);
    STATUS_STREAM.write(status_str);
    if (no_clear_line) {
        STATUS_STREAM.write('\n');
    }
}

/**
 * Convert a time to a human readable string
 */
function formatDuration(config: Config, duration: number) {
    let seconds = Math.floor((duration / 1000) % 60);
    let minutes = Math.floor((duration / (1000 * 60)) % 60);
    let hours = Math.floor(duration / (1000 * 60 * 60));

    let str = '';
    if (hours > 0) {
        str += `${hours}h `;
    }
    if (minutes > 0) {
        str += `${minutes}min `;
    }

    str += `${seconds}s`;

    let timeColor = 'dim';
    if (duration > 60000) timeColor = 'red';
    else if (duration > 30000) timeColor = 'yellow';

    return color(config, timeColor, str);
}

/**
 * @private
 */
export function detailedStatus(config: Config, state: RunnerState) {
    const {tasks} = state;
    const testResults = Array.from(state.resultByTaskGroup.values());
    const {skipped} = getResults(config, testResults);

    const done = tasks.filter(t => t.status === 'success' || t.status === 'error');
    const running = tasks.filter(t => t.status === 'running');

    const label = color(config, 'inverse-blue', 'STATUS');
    const progress = color(config, 'yellow', `${done.length}/${tasks.length - skipped.length} done`)+ `, ${running.length} running`;
    let str = `\n${label} at ${utils.localIso8601()}: ${progress}`;

    if (running.length > 0) {
        const now = performance.now();
        str += '\n';
        str += running
            .sort((a, b) => a.start - b.start)
            .map(t => {
                let out = `  ${t.name} ${formatDuration(config, now - t.start)}`;

                if (t.resources.length) {
                    let waiting = [];
                    let aquired = [];
                    for (const r of t.resources) {
                        const pending = state.pending_locks ? state.pending_locks.get(r) : null;
                        if (pending) {
                            waiting.push(r);
                        } else {
                            aquired.push(r);
                        }

                    }

                    const waiting_format = waiting.length ? `, waiting: ${color(config, 'red', waiting.join(', '))}` : '';
                    const aquired_format = aquired.length ? `, ${color(config, 'cyan', aquired.join(', '))}` : '';
                    out += aquired_format + waiting_format;
                }

                return out;
            })
            .join('\n');
    }

    // detailedStatus replaces the normal status string, so circumvent printing the status again
    if (config.logFunc) return config.logFunc(config, str);
    console.log(str); // eslint-disable-line no-console
}

/**
* Summarize test results.
* @hidden
* @param {ReturnType<typeof import('./results').getResults>} results
* @returns {string} A string with counts of the results.
**/
function resultSummary(config: Config, results) {
    const {
        success,
        errored,
        flaky,
        skipped,
        expectedToFail,
        expectedToFailButPassed,
    } = results;

    const maxChars = Math.max(
        ...[success.length, errored.length, flaky.length, skipped.length, expectedToFail.length, expectedToFailButPassed.length]
            .map(x => ('' + x).length)
    );
    const pad = str => (' '.repeat(maxChars) + str).slice(-maxChars);

    let res = '';
    if (success.length > 0) {
        res += color(config, 'green', `  ${pad(success.length)} tests passed\n`);
    }
    if (errored.length > 0) {
        res += color(config, 'red', `  ${pad(errored.length)} failed (${errored.map(s => s.name).join(', ')})\n`);
    }
    if (flaky.length) {
        res += color(config, 'lightMagenta', `  ${pad(flaky.length)} flaky (${flaky.map(s => s.name).join(', ')})\n`);
    }
    if (skipped.length) {
        res += color(config, 'cyan',`  ${pad(skipped.length)} skipped (${skipped.map(s => s.name).join(', ')})\n`);
    }
    if (expectedToFail.length) {
        res += `  ${pad(expectedToFail.length)} failed as expected (${expectedToFail.map(s => s.name).join(', ')})\n`;
    }
    if (expectedToFailButPassed.length) {
        res += color(config, 'red', `  ${pad(expectedToFailButPassed.length)} were expected to fail but passed (${expectedToFailButPassed.map(s => s.name).join(', ')})\n`);
    }
    return res;
}

export function finish(config: Config, state: RunnerState) {
    last_state = null;
    const {tasks} = state;
    assert(tasks);

    clean(config);

    let msg = '';
    if (tasks.length === 0 && config.filter) {
        msg += `No test case found with filter: ${config.filter}\n`;
    }
    const testResults = Array.from(state.resultByTaskGroup.values());
    const results = getResults(config, testResults);
    msg += resultSummary(config, results);

    if (!config.expect_nothing && (results.expectedToFail.length > 0)) {
        msg += color(config, 'dim', '  Pass in -E/--expect-nothing to ignore expectedToFail declarations.');
        msg += '\n\n';
    }

    // Internal self-check
    const inconsistent = tasks.filter(t => !['success', 'error', 'skipped'].includes(t.status));
    if (inconsistent.length) {
        msg +=
            `INTERNAL ERROR: ${inconsistent.length} out of ${tasks.length} tasks` +
            ` are in an inconsistent state. First affected task is ${inconsistent[0].name}` +
            ` in state ${inconsistent[0].status}.`;
    }

    if (config.logFunc) {
        config.logFunc(config, msg);
        return;
    }

    if (config.log_file) {
        reportLogFile(config, msg);
    }

    STATUS_STREAM.write(msg);
}

/**
 * @private
 */
function reportLogFile(config: Config, message: string) {
    const time = utils.localIso8601();
    message = `${time} ${kolorist.stripColors(message)}`;
    if (!message.endsWith('\n')) {
        message += '\n';
    }

    config.log_file_stream.write(message);
}

export function log(config: Config, message: string) {
    if (config.logFunc) return config.logFunc(config, message);

    if (config.log_file) {
        reportLogFile(config, message);
    }

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

export function logVerbose(config: Config, message: string) {
    if (!config.verbose) {
        if (config.log_file) {
            reportLogFile(config, message);
        }
        return;
    }
    log(config, message);
}

/**
 * Indent string
 * @param {number} n Levels of indentation
 * @hidden
 */
function indent(n: number) {
    return '  '.repeat(n);
}

/**
 * Convert a value into a formatted string that can be used for
 * comparisons. Contrary to `JSON.stringify(value, null, 2)` this
 * will sort object properties which is necessary to get a meaningful
 * diff.
 * @hidden
 */
export function stringify(value: any, level = 0): string {
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

function shouldShowDiff(err) {
    if (err.expected === undefined || err.actual === undefined) {
        return false;
    }

    // Check if actual and expected are the same type
    if (Object.prototype.toString.call(err.actual) !== Object.prototype.toString.call(err.expected)) {
        return false;
    }

    // Chaijs adds a showDiff property
    if (err.showDiff) return true;

    if (
        typeof err.actual === 'string' && typeof err.expected === 'string'
        && err.actual.includes('\n') && err.expected.includes('\n')
    ) {
        return true;
    }

    return false;
}

/**
 * Generates a diff to be printed in stdout
 * @param {*} config The pentf configuration object.
 * @param {Error} err The error to generate the diff from
 * @returns {string}
 * @hidden
 */
export function generateDiff(config: Config, err) {
    assert(err);

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

export function color(config: Config, colorName: string, str: string) {
    if (!config.colors) {
        return str;
    }

    // Labels like "FAILED" or "PASSED" need a bit of visual padding.
    if (['FAILED', 'PASSED', 'STATUS'].includes(str)) {
        str = ` ${str} `;
    }

    const m = /^inverse-(.*)$/.exec(colorName);
    if (m) {
        colorName = m[1];
        assert(kolorist[colorName], `Unsupported color ${colorName}`);
        return kolorist.inverse(kolorist[colorName](str));
    }

    const m2 = /^bold-(.*)$/.exec(colorName);
    if (m2) {
        colorName = m2[1];
        assert(kolorist[colorName], `Unsupported color ${colorName}`);
        return kolorist.bold(kolorist[colorName](str));
    }

    assert(kolorist[colorName], `Unsupported color ${colorName}`);
    return kolorist[colorName](str);
}

/**
 * Mark a string as a link for terminals that support this (GNOME Terminal)
 * @hidden
 */
function link(config: Config, text: string, target: string) {
    if (!config.colors || process.env.CI) {
        return text;
    }

    return kolorist.link(text, target);
}

/**
 * Convert tabs indentation to two spaces.
 */
function tabs2Spaces(str: string) {
    return str.replace(/^\t+/, tabs => '  '.repeat(tabs.length));
}

/**
 * @param {string} str String to indent
 * @param {number} n Indentation level
 */
function indentLines(str: string, n: number) {
    return str.split(/\n/g)
        .map(line => line && line !== '\n' ? '  '.repeat(n) + line : line)
        .join('\n');
}

/**
 * Generate an excerpt of the location in the source around the
 * specified position.
 * @param {*} config
 * @param {string} content Text content to generate the code frame of
 * @param {number} lineNum zero-based line number
 * @param {number} columnNum zero-based column number
 * @param {number} before Number of lines to show before the marker
 * @param {number} columnNum Number of lines to show after the marker
 */
function genCodeFrame(config: Config, content: string, lineNum: number, columnNum: number, before: number, after: number) {
    const lines = content.split('\n');
    const startLine = Math.max(0, lineNum - before);
    const endLine = Math.min(lines.length - 1, lineNum + after);
    const maxChars = String(endLine).length;
    const padding = ' '.repeat(maxChars);

    return lines.slice(startLine, endLine)
        .map((line, i) => {
            const n = startLine + i;
            const currentLine = (padding + (n + 1)).slice(-maxChars);

            const normalized = tabs2Spaces(line);
            if (n === lineNum) {
                const marker = color(config, 'bold-red', '>');
                const formatted = `${marker} ${currentLine} | ${normalized}`;

                // Account for possible tab indention
                const count = (normalized.length - line.length) + columnNum - 1;

                return formatted + `\n  ${padding} ${color(config, 'dim', '|')} ${' '.repeat(count)}${color(config, 'bold-red', '^')}`;
            } else {
                return color(config, 'dim', `  ${currentLine} | ${normalized}`);
            }
        })
        .join('\n');
}

/**
 * Format the error
 * @hidden
 */
export async function formatError(config: Config, err: Error) {
    let diff = '';
    if (shouldShowDiff(err)) {
        diff += generateDiff(config, err);
    }

    /**
     * The nearest location where the user's code triggered the error.
     */
    let nearestFrame: StackFrame;

    // Assertion libraries often add multiline messages to the error stack.
    const actualStack = err.stack!
        .replace(`${err.name}: ${err.message}`, '')
        .replace(err.message, '');

    const stack = errorstacks.parseStackTrace(actualStack)
        .map(frame => {
            if (frame.name) {
                // Native node ES Modules prints URIs instead of pathnames,
                // depending on whether the package the file is part of is
                // marked as a module. The URI usually starts with
                // `file://`, but some files lack the protocol and only
                // start with a semicolon `://`.
                frame.fileName = frame.fileName.replace(/^(file)?:\/\//, '');

                // Only show frame for errors in the user's code
                if (process.env.PENTF_SHOW_CODE_FRAMES !== 'false' && !nearestFrame && !/node_modules/.test(frame.fileName) && frame.fileName.startsWith(config._rootDir)) {
                    nearestFrame = frame;
                }

                const location = link(config, frame.fileName, `file://${frame.fileName}`);
                return color(config, 'dim', `at ${frame.name} (`) + color(config, 'cyan', location) + color(config, 'dim', `:${frame.line}:${frame.column})`);
            } else {
                // Internal native code in node (or CI system)
                return color(config, 'dim', frame.raw.trim());
            }
        })
        .join('\n');


    let codeFrame = '';
    try {
        if (nearestFrame) {
            const { fileName, line, column } = nearestFrame;
            if (isAbsolute(fileName)) { // relative path = node internals
                const content = await fs.promises.readFile(fileName, 'utf-8');
                codeFrame = `\n${genCodeFrame(config, content, line - 1, column, 2, 3)}\n\n`;
            }
        }
    } catch (readError) {
        log(config, 'INTERNAL WARNING: Failed to read stack frame code: ' + readError);
    }

    let message = `${err.name}: ${err.message}`;
    if (!message.endsWith('\n')) message +='\n';

    return '\n'
        + diff
        + indentLines(message, 1)
        + indentLines(codeFrame, 1)
        + indentLines(stack, 2);
}

/**
 * @private
 */
export function shouldShowError(config: Config, task: Task) {
    return (
        !(config.ignore_errors && (new RegExp(config.ignore_errors)).test(task.error.stack)) &&
        (config.expect_nothing || !task.expectedToFail || task.expectedToFail && task.status === 'success'));
}

/**
 * @private
 */
export async function logTaskError(config: Config, task: Task) {
    const show_error = shouldShowError(config, task);
    const e = task.error;
    if (config.verbose) {
        log(
            config,
            '[task] Decided whether to show error for task ' +
            `${task._runner_task_id} (${task.name}): ${JSON.stringify(show_error)}`
        );
    }
    if (show_error) {
        const name = color(config, 'lightCyan', task.name);
        if (e.pentf_expectedToSucceed) {
            const label = color(config, 'inverse-green', 'PASSED');
            log(
                config, `${label} test case ${name} at ${utils.localIso8601()} but section was expected to fail:\n${e.stack}\n`);
        } else {
            const label = color(config, 'inverse-red', 'FAILED');
            log(
                config,
                `${label} test case ${name} at ${utils.localIso8601()}:\n` +
                `${await formatError(config, e)}\n`);

            // There won't be a useful stack trace if the test timed out.
            // Display collected breadcrumb additionally if there is one.
            if (/Timeout:\sTest\scase/.test(e.message)) {
                if (task.breadcrumb) {
                    log(
                        config,
                        `${await formatError(config, task.breadcrumb)}\n`
                    );
                } else {
                    log(config, '  No breadcrumbs were collected.\n');
                }
            }
        }
    }
}


/**
 * Generate a string representation for a random value.
 *
 * @param {*} value A random value.
 * @hidden
 */
export function valueRepr(value: any) {
    if (typeof value === 'symbol') {
        return value.toString();
    }

    if (['undefined', 'boolean', 'number', 'bigint', 'string'].includes(typeof value) || (value === null) ||
            (typeof value === 'object' && value && (Array.isArray(value) || value.constructor === Object(value)))) {

        // Probably a plain object, try JSON
        try {
            return JSON.stringify(value);
        } catch (jsonErr) {
            // ignore
        }
    }

    return '' + value;
}
