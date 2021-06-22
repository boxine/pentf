const assert = require('assert').strict;
const path = require('path');
const { _readConfigFile: readConfigFile } = require('../src/config');

async function run() {
    const exampleDir = path.join(__dirname, 'config_examples');
    const exampleConfig = await readConfigFile(exampleDir, 'json', 'commonjs');

    assert(exampleConfig.json_loaded);
    assert(exampleConfig.simple_loaded);
    assert(exampleConfig.async_loaded);
    assert.equal(exampleConfig.overriden, 'json');
    assert.equal(exampleConfig.server, 'https://async_javascript.example.org/');
    assert.equal(
        exampleConfig.external_locking_url,
        'https://lockserver.example/'
    );
}

module.exports = {
    description: 'pentf configuration',
    resources: [],
    run,
};
