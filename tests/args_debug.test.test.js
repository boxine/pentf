const assert = require('assert').strict;
const {parseArgs} = require('../src/config');

async function run() {
    const args = parseArgs(
        {
            rootDir: __dirname,
            description: 'foobar',
        },
        ['--debug']
    );
    assert.equal(args.debug, true);
    assert.equal(args.devtools, true);
    assert.equal(args.devtools_preserve, true);
    assert.equal(args.forward_console, true);
    assert.equal(args.keep_open, true);
    assert.equal(args.headless, false);
}

module.exports = {
    description: 'pentf --debug flag',
    resources: [],
    run,
};
