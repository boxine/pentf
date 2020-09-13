const assert = require('assert').strict;
const path = require('path');
const {readConfig} = require('../src/config');

async function run() {
    const dir = path.join(__dirname, 'config_file');
    const config = await readConfig(
        { rootDir: dir },
        { config_file: 'pentf.config.js' }
    );

    assert(config.foo);

    // Check that we bail out of assertion on the root level
    const config2 = await readConfig(
        { rootDir: dir },
        { config_file: 'pentf.foo.config.js', env: 'foo' }
    );
    assert.equal(config2.foo, 'foo');
}

module.exports = {
    description: 'Support loading "--config FILE" configuration file (pentf.config.js)',
    run,
};
