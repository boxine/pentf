const child_process = require('child_process');
const {promisify} = require('util');

async function _cmd(cmd, args, options) {
    return (await (promisify(child_process.execFile)(cmd, args, options))).stdout.trim();
}

async function testsVersion(config) {
    try {
        const gitVersion = await _cmd(
            'git', ['show', '--pretty=format:%h (%ai)', '--no-patch', 'HEAD'],
            {cwd: config._testsDir});
        const changesStr = await _cmd('git', ['status', '--porcelain'], {cwd: config._testsDir});
        const changedFiles = (
            changesStr.split('\n')
                .filter(line => line)
                .map(line => line.trim().split(/\s+/, 2)[1]));
        const suffix = (changedFiles.length > 0) ? `+changes(${changedFiles.join(' ')})` : '';

        return gitVersion + suffix;
    } catch(e) {
        return 'unknown';
    }
}

function pintfVersion() {
    return require('./package.json').version;
}

module.exports = {
    testsVersion,
    pintfVersion,
};
