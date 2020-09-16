const assert = require('assert').strict;
const path = require('path');
const fs = require('fs');
const { execFile } = require('./helpers');

async function run() {
    const logFile = path.join(__dirname, 'log_file_tests', 'output.log');
    const sub_run = path.join(__dirname, 'log_file_tests', 'run');

    const remove = async () => {
        try {
            await fs.promises.unlink(logFile);
        } catch (err) {
            // Ignore any errors
        }
    };

    // Delete log file if it exists
    remove();

    await execFile(
        sub_run,
        ['--exit-zero', '--no-screenshots', '--log-file', logFile],
    );

    const content = await fs.promises.readFile(logFile, 'utf8');

    assert(/\[locking\]/.test(content), 'has verbose locking information');
    assert(/\[runner\]/.test(content), 'has runner information');
    assert(/\[task\]/.test(content), 'has task information');

    remove();
}

module.exports = {
    run,
    description: 'Writes logs to disk'
};
