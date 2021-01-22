const assert = require('assert').strict;
const {assertEventually} = require('pentf/assert_utils');
const {closePage, newPage, clickText} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    let clicks = [];

    await page.setContent(`
        <div>
            <button onclick="pentfClick('first')">first</button>
            <div data-testid="invisible" style="display:none;" onclick="pentfClick('invisible')">invisible</div>
        </div>
    `);
    await page.exposeFunction('pentfClick', clickId => {
        clicks.push(clickId);
    });

    // String variant
    await clickText(page, 'first');
    assert.deepStrictEqual(clicks, ['first']);

    clicks = [];
    await assert.rejects(clickText(page, 'not-present', {timeout: 1, extraMessage: 'blabla'}), {
        message: 'Unable to find text "not-present" after 1ms (blabla)',
    });
    assert.deepStrictEqual(clicks, []);

    // Option: assertSuccess
    let success = false;
    let called = false;
    await clickText(page, 'first', {
        assertSuccess: () => {
            called = true;
            const old = success;
            success = !success;
            return old;
        }
    });
    assert(called, 'assertSuccess was not invoked');

    await assertEventually(() => {
        assert.deepStrictEqual(clicks, ['first', 'first']);
        return true;
    }, {crashOnError: false, timeout: 1000});

    await closePage(page);
}

module.exports = {
    description: 'The clickText browser_utils function clicks elements by matching direct text content',
    resources: [],
    run,
};
