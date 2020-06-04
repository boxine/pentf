const {assertIncludes} = require('../assert_utils');
const {makeRandomEmail} = require('../utils');

async function run(config) {
    const testConfig = {
        ...config,
        email: 'john.smith@example.org',
    };

    assertIncludes(makeRandomEmail(testConfig, 'foobar'), '+foobar');
    assertIncludes(makeRandomEmail(testConfig), '+selftest_makeRandomEmail');
}

module.exports = {
    description: 'utils.makeRandomEmail: Generate a random email address (usually for an e2etest mailbox)',
    run,
    resources: [],
};
