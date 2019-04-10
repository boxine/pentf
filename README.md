# pintf - Parallel INTegration Test Framework

## Installation

```shell
npm i --save-dev pintf
```

## Usage

pintf can be used as a library (A standalone binary is also planned). Create a script named `run` in the directory of your tests, and fill it like this:

```javascript
#!/usr/bin/env node
require('pintf').main({
    rootDir: __dirname,
    description: 'Test my cool application',
});
```

## Writing tests

Plop a new `.js` file into `tests/`. Its name will be the test''s name, and it should have an async `run` function, like this:

```javascript
const assert = require('assert');
const {get_mail} = require('pintf/email');
const {new_page, close_page} = require('pintf/browser_utils');
const {fetch} = require('pintf/net_utils');
const {make_random_email} = require('pintf/utils');

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

    // Resources is a list of strings. Tests accessing the same resources are run sequentially.
    resources: ['toniebox_1234', 'another_resource'],
    // Default is one resource with the name `test_${test.name}`, i.e. tests are not run concurrently by default
    // Using no shared resources? Set resources: []
};
```

Note that while the above example tests a webpage with [puppeteer](https://github.com/GoogleChrome/puppeteer) and uses pintf's has native support for HTTP requests (in `net_utils`) and email sending (in `email`), tests can be anything – they just have to fail the promise if the test fails.
