const assert = require('assert');

const {closePage, newPage, clickTestId} = require('../browser_utils');
const {assertEventually} = require('../utils');

async function run(config) {
    const page = await newPage(config);
    const clicks = [];

    await page.setContent(`
        <div data-testid="first" onclick="javascript:pentfClick('first')">first</div>
        <div data-testid="invisible" style="display:none;" onclick="pentfClick('invisible')">invisible</div>
    `);
    await page.exposeFunction('pentfClick', clickId => {
        clicks.push(clickId);
    });

    await assert.rejects(clickTestId(page, 'not-present', {timeout: 1, extraMessage: 'blabla'}), {
        message: 'Failed to find visible element with data-testid "not-present" within 1ms. blabla',
    });
    assert.deepStrictEqual(clicks, []);

    await assert.rejects(clickTestId(page, 'not-present', {timeout: 1, visible: false}), {
        message: 'Failed to find element with data-testid "not-present" within 1ms',
    });
    assert.deepStrictEqual(clicks, []);

    await clickTestId(page, 'first');
    await assertEventually(() => assert.deepStrictEqual(clicks, ['first']), {
        mesage: 'click should have been registered',
        crashOnError: false,
    });
    clicks.splice(0, clicks.length);

    await assert.rejects(clickTestId(page, 'invisible', {timeout: 43}), {
        message: 'Failed to find visible element with data-testid "invisible" within 43ms',
    });
    assert.deepStrictEqual(clicks, []);

    await clickTestId(page, 'invisible', {visible: false, timeout: 1000});
    assert.deepStrictEqual(clicks, ['invisible']);

    await closePage(page);
}

module.exports = {
    description:
        'The clickTestId browser_utils function clicks an element selected by its data-testid attribute, atomically',
    resources: [],
    run,
};
