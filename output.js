// Functions to output the current state.
// For functions to render the state _after_ the tests have finished, look in render.js .
const readline = require('readline');

const utils = require('./utils');

const STATUS_STREAM = process.stderr;

var last_state;

function clean() {
    if (!STATUS_STREAM.isTTY) return;
    readline.cursorTo(STATUS_STREAM, 0);
    readline.clearLine(STATUS_STREAM, 0);
}

function status(config, state) {
    if (config.quiet) return;

    last_state = state;

    const running = state.filter(s => s.status === 'running');
    const running_count = running.length;
    const done_count = utils.count(state, s => (s.status === 'success') || (s.status === 'error'));
    const todo_count = utils.count(state, s => s.status === 'todo');

    // Fit output into one line
    // Instead of listing all running tests  (aaa bbb ccc), we write (aaa  +2).
    const terminal_width = STATUS_STREAM.getWindowSize ? STATUS_STREAM.getWindowSize()[0] : Infinity;
    let status_str;
    for (let running_show = running.length;running_show >= 0;running_show--) {
        const running_str = (
            running.slice(0, running_show).map(({tc}) => tc.name).join(' ')
            + (running_show < running.length ? '  +' + (running.length - running_show) : '')
        );
        status_str = `${running_count} running (${running_str}), ${done_count} done, ${todo_count} more`;

        if (status_str.length < terminal_width) {
            break; // Fits!
        }
    }

    clean();
    STATUS_STREAM.write(status_str);
    if (!STATUS_STREAM.isTTY) {
        STATUS_STREAM.write('\n');
    }
}


function finish(config, state) {
    last_state = null;
    if (config.quiet) return;

    clean();

    const success_count = utils.count(state, s => s.status === 'success');
    const error_count = utils.count(state, s => s.status === 'error');
    const skipped = state.filter(s => s.status === 'skipped');
    STATUS_STREAM.write(`${success_count} tests passed, ${error_count} tests failed.\n`);
    if (skipped.length > 0) {
        STATUS_STREAM.write(`Skipped ${skipped.length} tests (${skipped.map (s => s.name).join(' ')})\n`);
    }
}

function log(config, message) {
    if (! config.concurrency) {
        console.log(message);  // eslint-disable-line no-console
        return;
    }

    if (last_state) {
        clean();
    }
    console.log(message); // eslint-disable-line no-console
    if (last_state) {
        status(config, last_state);
    }
}

function log_verbose(config, message) {
    if (!config.verbose) return;
    log(config, message);
}

module.exports = {
    finish,
    log,
    log_verbose,
    status,
};
