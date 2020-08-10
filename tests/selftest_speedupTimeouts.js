const assert = require('assert').strict;

const {speedupTimeouts, restoreTimeouts, closePage, newPage} = require('../src/browser_utils');
const {assertAlways, assertEventually} = require('../src/assert_utils');

async function run(config) {
    const page = await newPage(config);
    const calls = [];
    await page.setContent('test');
    await page.exposeFunction('registerCall', async id => calls.push(id));

    // setTimeout (simple case)
    await speedupTimeouts(page, {factor: 100000});
    await page.evaluate(() => window.setTimeout(() => window.registerCall('first'), 1000000));
    await assertEventually(() => calls.includes('first'), {timeout: 500});

    // setInterval
    calls.splice(0, calls.length);
    await page.evaluate(() => {
        window.testInterval = window.setInterval(() => window.registerCall('setInterval'), 1000000);
    });
    await assertEventually(() => calls.length > 1, {timeout: 500});
    assert.strictEqual(calls[0], 'setInterval');
    assert.strictEqual(calls[1], 'setInterval');
    await page.evaluate(() => window.clearInterval(window.testInterval));

    // Test without timeout (e.g. next tick)
    calls.splice(0, calls.length);
    await page.evaluate(() => window.setTimeout(() => window.registerCall('without-timeout')));
    await assertEventually(() => calls.includes('without-timeout'), {timeout: 500});

    // Restore timeouts to original
    calls.splice(0, calls.length);
    await restoreTimeouts(page);
    await page.evaluate(() => window.setTimeout(() => window.registerCall('never'), 100000));
    await assertAlways(() => calls.length === 0, {timeout: 100});

    // Persistent speedup
    await speedupTimeouts(page, {factor: 100000, persistent: true});
    await page.goto('about:blank');
    await page.evaluate(() => setTimeout(() => window.registerCall('persistent'), 1000000));
    await assertEventually(() => calls.includes('persistent'), {timeout: 500});

    await closePage(page);
}

module.exports = {
    description: 'browser_utils.speedupTimeouts makes JavaScript timeouts and intervals return far earlier',
    resources: [],
    run,
};
