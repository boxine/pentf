const assert = require('assert').strict;
const path = require('path');
const { readConfig } = require('../src/config');

async function run() {
    const dir = path.join(__dirname, 'config_pkg_json');
    const config = await readConfig({ rootDir: path.join(dir, 'nested') }, {});

    assert(config.foo);

    // Check that we bail out of assertion on the root level
    const config2 = await readConfig(
        { rootDir: path.dirname(process.cwd()) },
        {}
    );
    assert(!('foo' in config2));
}

module.exports = {
    description:
        'Support loading configuration from "pentf" key in package.json',
    resources: [],
    run,
};
