# pintf - Parallel INTegration Test Framework

## Installation

```shell
npm i --save-dev pintf puppeteer
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

Make the file executable with `chmod a+x run`, and from then on type

```shell
./run
```

to execute all tests. You may also want to have a look at the [options](#options).

## Writing tests

Plop a new `.js` file into `tests/`. Its name will be the test''s name, and it should have an async `run` function, like this:

```javascript
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
```

Note that while the above example tests a webpage with [puppeteer](https://github.com/GoogleChrome/puppeteer) and uses pintf's has native support for HTTP requests (in `net_utils`) and email sending (in `email`), tests can be anything – they just have to fail the promise if the test fails.

## Configuration

pintf is designed to be run against different configurations, e.g. local/dev/stage/prod. Create JSON files in the `config` subdirectory for each environment. You can also add a programatic configuration by passing a function `defaultConfig` to `pintf.main`; see [pintf's own run](run) for an example. 

The keys are up to you; for example you probably want to have a main entry point. Predefined keys are:

- **`imap`** If you are using the `pintf/email` module to fetch and test emails, configure your imap connection here, like
```
  "imap": {
    "user": "user@example.com",
    "password": "secret",
    "host": "mail.example.com",
    "port": 993,
    "tls": true
  }
```
- **`rejectUnauthorized`** Set to `false` to not check the certificate in TLS connections.

## Options

```
-h, --help            Show this help message and exit.
-e YOUR_ENVIRONMENTS, --env YOUR_ENVIRONMENTS
                      The environment to test against. Default is local.
--version             Print version of tests and test framework and exit.
```

###### Output

```
-v, --verbose         Let tests output diagnostic details
-q, --quiet           Do not output test status
--no-clear-line, --ci
                      Never clear the current output line (as if output is not a tty)
--print-config        Output the effective configuration and exit.
-c, --print-curl      Print curl commands for each HTTP request
-I REGEXP, --ignore-errors REGEXP
                      Do not output error messages matching the regular expression. Example: -I 
                      "\(TOC-[0-9]+\)"
-E, --expect-nothing  Ignore expectedToFail attributes on tests
```

###### Writing results to disk

```
-J, --json            Write tests results as a JSON file.
--json-file FILE.json
                      JSON file to write to. Defaults to results.json .
-H, --html            Write test results as an HTML file.
--html-file FILE.html
                      HTML file to write a report to. Defaults to results.html .
--pdf                 Write test results as a PDF file. (Now enabled by default)
--no-pdf              Do not write a PDF report with test results.
--pdf-file FILE.pdf   PDF file to write a report to. Defaults to results.pdf .
-M, --markdown        Write tests results as a Markdown file.
--markdown-file FILE.md
                      Markdown file to write a report to. Defaults to results.md .
--load-json INPUT.json
                      Load test results from JSON (instead of executing tests)
```

###### Test selection

```
-f REGEXP, --filter REGEXP
                      Regular expression to match tests to run
-l, --list            List all tests that would be run and exit
-a, --all, --include-slow-tests
                      Run tests that take a very long time
```

###### Email

```
--keep-emails         Keep generated emails instead of deleting them
--email-verbose       Log all IMAP commands and responses
```

###### puppeteer browser test

```
-V, --visible         Make browser tests visible (i.e. not headless)
--no-screenshots      Do not take screenshots of browser failures
--screenshot-directory DIR
                      Directory to write screenshots to (default: ./screenshots)
-s MS, --slow-mo MS   Wait this many milliseconds after every call to the virtual browser
-k, --keep-open       Keep browser sessions open in case of failures. Implies -V.
--devtools            Start browser with devtools open. Implies -V
--devtools-preserve   Configure devtools to preserve logs and network requests upon navigation. Implies 
                      --devtools
```

###### Test runner

```
-C COUNT, --concurrency COUNT
                      Maximum number of tests to run in parallel. 0 to run without a pool, sequentially. 
                      Defaults to 10.
-S, --sequential      Do not run tests in parallel (same as -C 0)
--fail-fast           Abort once a test fails
--print-tasks         Output all tasks that the runner would perform, and exit
--exit-zero           Terminate with exit code 0 (success) even if tests fail. (Exit codes != 0 are still 
                      emitted in cases of internal crashes)
```

###### Locking

```
-L, --no-locking      Completely disable any locking of resources between tests.
--locking-verbose     Output status messages about locking
--list-conflicts      Show which tasks conflict on which resources, and exit immediately
--manually-lock RESOURCES
                      Externally lock the specified comma-separated resources for 60s before the test
--list-locks, --list-external-locks
                      List (external) locks and exit
--clear-locks, --clear-external-locks
                      Clear all external locks and exit
--no-external-locking
                      Disable external locking (via a lockserver)
--external-locking-url URL
                      Override URL of lockserver
--display-locking-client
                      Display the locking client ID we would use if we would lock something now
```


## License

[MIT](LICENSE). Patches welcome!
