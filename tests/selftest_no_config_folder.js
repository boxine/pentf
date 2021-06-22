const assert = require('assert').strict;
const { readConfig } = require('../src/config');

async function run() {
    const config = await readConfig({}, {});
    assert.deepEqual(config, {
        afterAllTests: undefined,
        beforeAllTests: undefined,
        rootDir: process.cwd(),
        moduleType: 'commonjs',
        sentry: undefined,
        sentry_dsn: undefined,
    });
}

module.exports = {
    run,
    description: 'Works without config dir',
};
