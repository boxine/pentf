const assert = require('assert').strict;
const {readConfig} = require('../config');

async function run() {
    const config = await readConfig({}, {});
    assert.deepEqual(config, {
        afterAllTests: undefined,
        beforeAllTests: undefined,
        sentry: undefined,
        sentry_dsn: undefined
    });
}

module.exports = {
    run,
    description: 'Works without config dir'
};
