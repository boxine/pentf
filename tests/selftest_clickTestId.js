const assert = require('assert').strict;

const {closePage, newPage, clickTestId} = require('../src/browser_utils');
const {assertEventually} = require('../src/assert_utils');

async function run(config) {
    const page = await newPage(config);

    await page.setContent(`
        <script>
            window.clicks = [];
            function pentfClick(id) {
                window.clicks.push(id);
            }
        </script>
        <div data-testid="first" onclick="javascript:pentfClick('first')">first</div>
        <div data-testid="invisible" style="display:none;" onclick="pentfClick('invisible')">invisible</div>
    `);
    const getClicks = async () => page.evaluate(() => window.clicks);
    const resetClicks = async () => page.evaluate(() => (window.clicks = []));

    await assert.rejects(clickTestId(page, 'not-present', {timeout: 1, extraMessage: 'blabla'}), {
        message: 'Failed to find visible element with data-testid "not-present" within 1ms. blabla',
    });
    assert.deepStrictEqual(await getClicks(), []);

    await assert.rejects(clickTestId(page, 'not-present', {timeout: 1, visible: false}), {
        message: 'Failed to find element with data-testid "not-present" within 1ms',
    });
    assert.deepStrictEqual(await getClicks(), []);

    await clickTestId(page, 'first');
    await assertEventually(
        async () => assert.deepStrictEqual(await getClicks(), ['first']),
        {mesage: 'click should have been registered', crashOnError: false});
    await resetClicks();

    await assert.rejects(clickTestId(page, 'invisible', {timeout: 43}), {
        message: 'Failed to find visible element with data-testid "invisible" within 43ms',
    });
    assert.deepStrictEqual(await getClicks(), []);

    await clickTestId(page, 'invisible', {visible: false, timeout: 1000});
    assert.deepStrictEqual(await getClicks(), ['invisible']);

    // Option: assertSuccess
    let success = false;
    let called = false;
    await clickTestId(page, 'first', {
        assertSuccess: () => {
            called = true;
            const old = success;
            success = !success;
            return old;
        }
    });
    assert(called, 'assertSuccess was not invoked');

    await closePage(page);
}

module.exports = {
    description: 'The clickTestId browser_utils function clicks an element selected by its data-testid attribute, atomically',
    resources: [],
    run,
};
