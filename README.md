# pentf - Parallel End-To-End Test Framework

pentf runs end-to-end tests (with or without web browsers, emails, and/or direct HTTP requests) in a highly parallel manner, so that tests bound by client CPU can run while other tests are waiting for an email to arrive or slow external servers to answer.

Tests are written in plain JavaScript, typically using node's built-in [assert](https://nodejs.org/api/assert.html). You can use any other assertion framework too; a test is simply an `async` function which throws an exception to indicate test failure.

Browser tests using [puppeteer](https://pptr.dev/) benefit from special support such as isolation of parallel tests and screenshots of test failures as well as a number of [helper functions](https://boxine.github.io/pentf/modules/_browser_utils_.html), for example to wait for text to become visible.

Depending on the environment (you can set up configurations to run the same tests against dev, stage, prod etc.), tests can be skipped, or marked as _expected to fail_ for test driven development where you write tests first before fixing a bug or implementing a feature.
A locking system prevents two tests or the same tests on two different machines from accessing a shared resource, e.g. a test account.
You can review test results in a PDF report.

## Installation

```shell
npm i --save-dev pentf puppeteer
```

## Usage

pentf can be used both as a binary and as a library. If you're unsure what to pick, go with the binary route.

## Binary (npm scripts)

Add the following script to your `package.json` with the `--tests-glob` parameter matching to your test files:

```json
{
    "name": "my-package",
    "scripts": {
        "test": "pentf --tests-glob tests/**/*.js",
    }
}
```

Run `npm run test` or `yarn test` to launch pentf.

## Node API

Create a script named `run.js` in the directory of your tests, and fill it like this:

```javascript
require('pentf').main({
    rootDir: __dirname,
    description: 'Test my cool application',
});
```

Then type the following command

```shell
node run.js
```

to execute all tests. You may also want to have a look at the [options](#options).

## Writing tests

Plop a new `.js` file into `tests/`. Its name will be the test''s name, and it should have an async `run` function, like this:

```javascript
const assert = require('assert').strict;
const {getMail} = require('pentf/email');
const {newPage} = require('pentf/browser_utils');
const {fetch} = require('pentf/net_utils');
const {makeRandomEmail} = require('pentf/utils');

async function run(config) {
    const email = makeRandomEmail(config, 'pentf_example');
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
    // Run with --debug to see the browser's state at this time!
    // Any test failure is fine, but in a pinch, try uncommenting:

    // assert(false);
}

module.exports = {
    run,
    description: 'pentf test example', // optional description for test reports, can be left out

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

Note that while the above example tests a webpage with [puppeteer](https://github.com/GoogleChrome/puppeteer) and uses pentf's has native support for HTTP requests (in `net_utils`) and email sending (in `email`), tests can be anything – they just have to fail the promise if the test fails.

Have a look in the [API documentation](https://boxine.github.io/pentf/) for various helper functions.

### Creating a test suite

Pentf supports creating multiple test cases in the same file, which is commonly referred to as a suite.

```js
function suite(test, describe) {
    test('should do something', async () => {});
    test('should do something else', async () => {});

    describe('sub feature', () => {
        test('should work too', async () => {});
    });
}

module.exports = {
    suite
}
```

Specific tests or groups can be focused by appending `.only`. Only those defined with that property will run when the current suite is executed.

```js
function suite(test, describe) {
    test('I won\'t run', async () => {});
    test.only('I will run', async () => {});

    describe.only('foo', () => {
        test('I will run too', async() => {});
    });
}
```

Test cases or groups can be skipped in a similar way by appending `.skip`. Those tests will not be executed during a test run.

```js
function suite(test, describe) {
    test('I will run', async () => {});
    test.skip('I won\'t run', async () => {});

    describe.skip('foo', () => {
        test('I won\'t run', async() => {});
    });
}
```

## Tips for writing good tests

By their very nature, end-to-end tests can be flaky, i.e. sometimes succeed and sometimes fail when run multiple times. We want the tests to only relay the flakiness of the systems we test, and not introduce any additional flakiness ourselves. Here are a few tips for that:

### Use `data-testid` attributes in browser tests

Unless otherwise documented, class names and document structures are subject to change. By setting an explicit attribute like `data-testid="comment-button"` in the code, the developer and tester set up a stable contract.

**Avoid**: `await page.waitForSelector('h1 > div.main-container form p button.large-button');`

**Use**: `await waitForTestId(page, 'comment-button');`

### Always wait a bit

If the tests run quick and a remote system is slow, the browser UI may not update immediately. If there is high local system load (which is necessary for the tests to run quickly), then even local updates may not be immediate:

**Avoid**: `page.$('foo')`, `page.evaluate(() => document.querySelector('foo'))`

**Use**: `page.waitForSelector('foo')`

**Avoid**: `page.type('#foo', 'bar')`

**Use**: `browser_utils.typeSelector(page, '#foo', 'bar')`

### Make sure you start waiting _early_

Make sure that an action you are waiting on has not already happend. In particular, `await page.waitForNavigation()` calls should probably be replaced by checks for the new page.

**Avoid**:
```javascript
await page.press('Enter');
// If the page is quick, navigation may have already occured here!
await page.waitForNavigation();
await waitForText(page, 'email sent');

const since = new Date(); // Too late, email may already have been sent!
await getMail(config, since, email, 'Enter was pressed');
```

**Use**:
```javascript
const since = new Date();
await page.press('Enter');
await waitForText(page, 'email sent');

await getMail(config, since, email, 'Enter was pressed');
```

### Click atomically if the application updates its DOM a lot

If the application rerenders its DOM with JavaScript, you must take special care not to hold onto handles, because they might be invalid (the DOM nodes replaced by other ones) by the time you interact with them again.

**Avoid**:
```javascript
const buttonHandle = await page.waitForSelector('button[data-testid="send-email"]');
buttonHandle.click();
```

**Use** atomic clicking functions, e.g. from [`browser_utils`](https://boxine.github.io/pentf/modules/_browser_utils_.html):

```javascript
await clickTestId(page, 'send-email');
```

### Segregate tests by service

While the ultimate end-to-end test tests all services, it can be very helpful to add a test naming schema so that it's immediately clear which service or application errored. Even at the cost of some redundancy, backend tests e.g. using [`fetch`](https://boxine.github.io/pentf/modules/_net_utils_.html#fetch) (tip: check out the `--print-curl` option) instead of a full browser allow anyone to quickly see whether the problem occurs in the backend .

Note that this does **not** mean that test failures in other projects can be ignored: If a browser-based test often fails because of a certain API endpoint, that API endpoint should get its own test and further investigation.

**Use**: If suitable, get a test naming scheme, e.g. `email_deleted`, `email_notification`, `sms_notification`. That way, with `-f email_` you can run all email tests, and with `_notification` you can run all notification tests. Use a negative lookahead like `^(?!email_|carrier-pidgeon_)` to exclude some tests.

### assert early and often

When an error occurs, the test should abort immediately and not keep going on. This makes it clear where the error is and avoids confusion. A helpful error message is quick to write and saves a lot of debugging time later.

**Avoid**:
```javascript
const id = data.foo.bar.id;
const response = await fetch(`https://example.org/widget/${id}`);
const text = await response.text();
```

What happens if the ID is not found? Then we will request `https://example.org/widget/undefined`!
If the server is down, the text we get back may be an error page.

**Use**:
```javascript
const id = data.foo.bar.id;
assert(id, 'ID is not set – unrecognized error in the backend?');
const response = await fetch(`https://example.org/widget/${id}`);
assert.equal(response.status, 200);
const text = await response.text();
```

### Use `assert` in strict mode

In [strict assertion mode](https://nodejs.org/api/assert.html#assert_strict_assertion_mode), `assert` generates better errors and is generally easier to deal with.

**Avoid**: `const assert = require('assert');`

**Use**: `const assert = require('assert').strict;`

## Skipping tests

If a test should not run within an environment – maybe the tested service is not available in that environment, or you don't want to run a DoS test against prod – you can skip it. Simply export a function `skip` that gets called with the pentf configuration object. It returns true or a non-empty string to indicate that the test should be skipped, like this:

```javascript
module.exports = {
    run,
    skip: config => (config.env === 'prod') && 'This test could impact customers and is therefore not run against prod',
};
```

## Test-driven development with `expectedToFail`

If you write the test before a bug is fixed or a new feature is deployed, you can mark the test as `expectedToFail`. An `expectedToFail` test is still run, but if it fails the pipeline will still be green. If an `expectedToFail` test succeeds, a warning is printed, but the test is still seen as successful. It is a good idea to include a ticket number in the output so that everybody can look up the status, like this:


```javascript
module.exports = {
    run,
    expectedToFail: config => ['stage', 'prod'].includes(config.env) && 'Not yet rolled out (BUG-1234)',
};
```

You can also mark a code section instead of a full test with the [function `expectedToFail`](https://boxine.github.io/pentf/modules/_promise_utils_.html#expectedtofail).

Use `-E`/`--expect-nothing` to disable the expectedToFail special treatment.

## Configuration

pentf is designed to be run against different configurations, e.g. local/dev/stage/prod. Create files in the `config` subdirectory for each environment, in one of the following formats:

- JSON: A `.json` file with the keys and associated values. ([example](tests/config_examples/json.json))
- Simple JavaScript: A `.js` file which exports the configuration. ([example](tests/config_examples/simple_javascript.js))
- Async JavaScript: A `.js` file which exports an async function being called with the environment name and returning the configuration. ([example](tests/config_examples/async_javascript.js))

You can also add a programatic configuration for multiple environments by passing a function `defaultConfig` to `pentf.main`; see [pentf's own run](run) for an example.

The keys are up to you; for example you probably want to have a main entry point. pentf claims the following keys:

- **`extends`** Inherit from the specified environment. It is common to have a `_common` environment (i.e. a file `_common.json` or `common.`) which all environments inherit from. You can also construct combined environments, e.g. prod backend with a development frontend.
- **`external_locking_url`** Base URL of the external lockserver to use to avoid test runs on different machines using shared resources (such as test accounts, limited widgets etc.) at the same time (see _locking_ below).
- **`email`** The base email address used in [`makeRandomEmail`](https://boxine.github.io/pentf/modules/_utils_.html#makerandomemail).
- **`imap`** If you are using the `pentf/email` module to fetch and test emails, configure your imap connection here, like
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
--config FILE         Path to config file. (Default: pentf.config.js)
```

###### Output

```
-v, --verbose         Let tests output diagnostic details
--log-file FILE       Write verbose log information to disk. Doesn't affect tty logging.
-q, --quiet           Do not output test status
--no-clear-line, --ci
                      Never clear the current output line (as if output is not a tty)
--print-config        Output the effective configuration and exit.
-c, --print-curl      Print curl commands for each HTTP request
-I REGEXP, --ignore-errors REGEXP
                      Do not output error messages matching the regular expression. Example: -I 
                      "\(TOC-[0-9]+\)"
-E, --expect-nothing  Ignore expectedToFail attributes on tests
--no-colors           Disable colors in stdout
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
--sentry              Enable error reporting via Sentry. By default, this will be activated if the CI 
                      environment variable is set and a SENTRY_DSN is configured.
--no-sentry           Disable error reporting via Sentry even if it is configured
--sentry-dsn OVERRIDE_SENTRY_DSN
                      Override Sentry DSN. By default, the SENTRY_DSN environment variable is used.
```

###### Test selection

```
-f REGEXP, --filter REGEXP
                      Regular expression to match names of tests to run
-b REGEXP, --filter-body REGEXP
                      Run only tests whose full code is matched by this regular expression
-l, --list            List all tests that would be run and exit
-a, --all, --include-slow-tests
                      Run tests that take a very long time
--tests-glob TESTSGLOB
                      Glob pattern to use when searching test files
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
--snapshot-directory DIR
                      Directory to write snapshots to (default: ./snapshots)
-u, --update-snapshots
                      Update existing snapshots on mismatch
-s MS, --slow-mo MS   Wait this many milliseconds after every call to the virtual browser
-k, --keep-open       Keep browser sessions open in case of failures. Implies -V.
--devtools            Start browser with devtools open. Implies -V
--devtools-preserve   Configure devtools to preserve logs and network requests upon navigation. Implies 
                      --devtools
--extensions [EXTENSION_DIR [EXTENSION_DIR ...]]
                      Load unpacked browser extensions
--forward-console     Forward browser console logs
--show-interactions   Visually show on the page where a user interaction took place (clicks, taps,...)
-d, --debug           Shorthand for "--keep-open --devtools-preserve --forward-console"
--default-timeout MS  Default timeout value for various browser functions (default: 30s)
```

###### Test runner

```
-C COUNT, --concurrency COUNT
                      Maximum number of tests to run in parallel. 0 to run without a pool, sequentially. 
                      Can include *, +, and cpus for the number of CPUs. Defaults to cpus.
-S, --sequential      Do not run tests in parallel (same as -C 0)
--fail-fast           Abort once a test fails
--print-tasks         Output all tasks that the runner would perform, and exit
--exit-zero           Terminate with exit code 0 (success) even if tests fail. (Exit codes != 0 are still 
                      emitted in cases of internal crashes)
--repeat COUNT        Run the tests the specified number of times
--repeat-flaky COUNT  Repeat a failing test until it passes or the specified run count limit is reached
--timeout MS          Set a maximum duration for a test case in ms before timing out. (Default: 1h)
--status-interval MS  Interval in MS to print a detailed list of the current runner state.
--breadcrumbs         Keep track of the last successful browser operation (breadcrumbs). This helps with 
                      debugging test cases that timed out.
-w, --watch           Re-run tests if a test file changes.
--watch-files [WATCH_FILES [WATCH_FILES ...]]
                      Listen for these additional files in watch mode.
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


## Environment Variables

Pentf supports settings that can be set via an environment variable.

| Name | Values | Description |
|---|---|---|
| `PENTF_SHOW_CODE_FRAMES` | `true` / `false` | Enable or disable amending error stacks with a code frame depicting an excerpt of the code surrounding the error location. |

## License

[MIT](LICENSE). Patches welcome!

## Deprecation policy

Sometimes, we have to deprecate or move a legacy name or feature. The pentf deprecation policy is as following:

1. For 6 months, a warning is only output if the `PENTF_FUTURE_DEPRECATIONS` environment variable is set.
2. Deprecation warnings are output all the time, but everything continues to work for 6 more months.
3. Afterwards, as long as we can find any usages of the legacy variant, we keep supporting it.
4. Finally, once there are no known usages of the legacy variant, we stop support alltogether.

Note that the times only apply if we cannot prove that all usages have been moved.

### Currently deprecated

|Feature|Replaced by|Deprecation start|
|-------|-----------|-----------------|
|`utils.assertEventually`|`assert_utils.assertEventually`|2020-11-19|
|`utils.assertAsyncEventually`|`assert_utils.assertAsyncEventually`|2020-11-19|
|`utils.assertAlways`|`assert_utils.assertAlways`|2020-11-19|
