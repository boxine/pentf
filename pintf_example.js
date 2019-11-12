const assert = require('assert');
const {getMail} = require('pintf/email');
const {newPage, closePage} = require('pintf/browser_utils');
const {fetch} = require('pintf/net_utils');
const {makeRandomEmail} = require('pintf/utils');

async function run(config) {
    const email = makeRandomEmail(config, 'pintf_example');
    const start = new Date();
    const response = await fetch(config, 'https://api.tonie.cloud/v2/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            locale: 'en',
            email: email,
            password: 'Secret123',
            acceptedGeneralTerms: true,
            acceptedPrivacyTerms: true,
        }),
    });
    assert.equal(response.status, 201);
    assert((await response.json()).jwt);

    const mail = await getMail(config, start, email, 'Your Toniecloud confirmation link');
    assert(mail);

    // Test with a browser
    const page = await newPage(config);
    await page.goto('https://meine.tonies.de/');

    // During development, you can make the test fail.
    // Run with -k to see the browser's state at this time!
    // Any test failure is fine, but in a pinch, try uncommenting:

    // assert(false);

    await closePage(page);
}

module.exports = {
    run,
    description: 'pintf test example', // optional description for test reports, can be left out

    // You can skip the test in some conditions by defining an optional skip method:
    skip: config => config.env === 'prod',

    // Optional: a true-ish value to indicate that to suppress output about this test if it fails.
    // Used to indicate tests for bugs/features that are not yet implemented (e.g. with TDD).
    // Strings will be reported; the URL to an issue is a good and typical value.
    // Alternatively, a function that is called with the config and returns a value as described above.
    expectedToFail: config => (config.env === 'alwaysbroken') ? 'Known to be broken here' : false,

    // Resources is a list of strings. Tests accessing the same resources are run sequentially.
    resources: ['toniebox_1234', 'another_resource'],
    // Default is one resource with the name `test_${test.name}`, i.e. tests are not run concurrently by default
    // Using no shared resources? Set resources: []
};
