const assert = require('assert');
const child_process = require('child_process');
const path = require('path');
const {promisify} = require('util');

const {testsVersion} = require('../version');

async function run() {
    const scratchDir = path.join(__dirname, 'version_tests');
    const exampleRepo = path.join(scratchDir, 'example_repo');

    await promisify(child_process.execFile)('tar', ['xf', 'example_repo.tar.gz'], {
        cwd: scratchDir,
    });

    const pseudoConfig = {
        rootDir: exampleRepo,
        _testsDir: path.join(exampleRepo, 'tests'), // This is normally auto-computed by the runner start
    };
    const v = await testsVersion(pseudoConfig);
    const expectedRegex = /^6f053c5 \((.*?)\)\+changes\(tests\/firsttest.js\)$/;
    const m = expectedRegex.exec(v);
    assert(m, `Version ${v} does not match ${expectedRegex}`);

    // Timezone-independent comparison
    const date = new Date(m[1]);
    assert.equal(date.getTime(), new Date('2020-02-15 11:52:20 +0100').getTime());
}

module.exports = {
    description: 'Determine git version of the tests',
    resources: [],
    run,
};
