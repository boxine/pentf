const child_process = require('child_process');
const path = require('path');
const { onTeardown } = require('../runner');

/**
 * @param {string} file
 * @param {string[]} args
 * @param {import('child_process').ExecFileOptionsWithBufferEncoding} [options]
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function execFile(file, args, options = {}) {
    return await new Promise((resolve, reject) => {
        child_process.execFile(
            file,
            args,
            { cwd: path.dirname(file), ...options},
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });
}

/**
 * @param {import('../src/config').Config} config
 * @param {string} file
 * @param {string[]} args
 * @param {(data: string) => void} onData
 */
async function spawn(config, file, args, onData) {
    const child = child_process.spawn(file, args);
    onTeardown(config, () => child.kill());

    child.stdout.on('data', data => onData(data.toString()));
    child.stderr.on('data', data => onData(data.toString()));
}

module.exports = {
    execFile,
    spawn,
};
