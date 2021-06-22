const assert = require('assert').strict;
const { assertIncludes } = require('../src/assert_utils');
const { makeRandomEmail } = require('../src/utils');

async function run(config) {
    const testConfig = {
        ...config,
        email: 'john.smith@example.org',
    };

    assertIncludes(makeRandomEmail(testConfig, 'foobar'), '+foobar');
    assertIncludes(makeRandomEmail(testConfig), '+selftest_makeRandomEmail');

    // Strips invalid characters
    assertIncludes(makeRandomEmail(testConfig, 'foo[0]'), 'john.smith+foo_0_');

    // Throw on invalid local path length
    assert.throws(() =>
        makeRandomEmail(
            testConfig,
            'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
        )
    );
}

module.exports = {
    description:
        'utils.makeRandomEmail: Generate a random email address (usually for an e2etest mailbox)',
    run,
    resources: [],
};
