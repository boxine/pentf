const assert = require('assert');
const {get_mail} = require('../pintf/email');
const {new_page, close_page} = require('../pintf/browser_utils');
const {fetch} = require('../pintf/net_utils');
const {make_random_email} = require('../pintf/utils');

async function run(config) {
    const email = make_random_email(config, 'pintf_example');
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

    const mail = await get_mail(config, start, email, 'Your Toniecloud confirmation link');
    assert(mail);

    // Test with a browser
    const page = await new_page(config);
    await page.goto('https://meine.tonies.de/');

    // During development, you can make the test fail.
    // Run with -k to see the browser's state at this time!
    // Any test failure is fine, but in a pinch, try uncommenting:

    // assert(false);

    await close_page(page);
}

module.exports = {
    run,
    description: 'pintf test example', // optional description for test reports, can be left out

    // You can skip the test in some conditions by defining an optional skip method:
    skip: config => config.env === 'prod',

    // The "after" key can make the test run only after other tests have run.
    // Example:   after: ['prepare_account'],
};
