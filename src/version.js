const child_process = require('child_process');
const {promisify} = require('util');
const {EOL} = require('os');
const fs = require('fs');
const path = require('path');

async function _cmd(cmd, args, options) {
    return (await (promisify(child_process.execFile)(cmd, args, options))).stdout.trim();
}

async function testsVersion(config) {
    try {
        const tagsOutput = await _cmd(
            'git', ['tag', '--points-at', 'HEAD'], {cwd: config._testsDir});
        const tags = tagsOutput.split(EOL).filter(line => line);
        const tagsRepr = (tags.length > 0) ? tags.join('/') + '/' : '';

        const gitVersion = await _cmd(
            'git', ['show', '--pretty=format:%h (%ai)', '--no-patch', 'HEAD'],
            {cwd: config._testsDir});
        const changesOutput = await _cmd('git', ['status', '--porcelain'], {cwd: config._testsDir});
        const changedFiles = (
            changesOutput.split(EOL)
                .filter(line => line)
                .map(line => line.trim().split(/\s+/, 2)[1]));
        const suffix = (changedFiles.length > 0) ? `+changes(${changedFiles.join(' ')})` : '';

        return tagsRepr + gitVersion + suffix;
    } catch(e) {
        // go on
    }

    // Are we in a CI pipeline? Use these values instead
    const {env} = process;
    if (env.CI_COMMIT_SHORT_SHA) {
        const name = (env.CI_COMMIT_TAG || env.CI_COMMIT_BRANCH || '').trim();
        return (name ? name + ' ' : '') + env.CI_COMMIT_SHORT_SHA.trim();
    }

    return 'unknown';
}

function pentfVersion() {
    // Don't use inline synchronous `require()` here, because
    // that cannot be translated to ES Modules. For ES Modules
    // any inline `import()` call is asynchronous.
    // Work around that by invoking `fs.readFileSync()` instead.
    //
    // The variable __dirname is not present in ESM environments.
    // It will be replaced with a polyfill by our babel plugin.
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')).version;
}

module.exports = {
    testsVersion,
    pentfVersion,
};
