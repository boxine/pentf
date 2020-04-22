const assert = require('assert');

const {closePage, newPage, clickNestedText} = require('../browser_utils');

async function run(config) {
    const page = await newPage(config);
    let clicks = [];

    await page.setContent(`
        <div>
            <button onclick="pentfClick('first')">first</button>
            <button onclick="pentfClick('nested')">Some <span>nested <b>text</b></span></button>
            <div>Some <span onclick="pentfClick('span')">span <b>text</b></span></div>
            <div data-testid="invisible" style="display:none;" onclick="pentfClick('invisible')">invisible</div>
        </div>
    `);
    await page.exposeFunction('pentfClick', clickId => {
        clicks.push(clickId);
    });
    
    // String variant
    await clickNestedText(page, 'first');
    assert.deepStrictEqual(clicks, ['first']);
    
    await clickNestedText(page, 'Some nested text');
    assert.deepStrictEqual(clicks, ['first', 'nested']);

    clicks = [];
    await assert.rejects(clickNestedText(page, 'not-present', {timeout: 1, extraMessage: 'blabla'}), {
        message: 'Unable to find visible text "not-present" after 1ms (blabla)',
    });
    assert.deepStrictEqual(clicks, []);

    await assert.rejects(clickNestedText(page, 'invisible', {timeout: 43}), {
        message: 'Unable to find visible text "invisible" after 43ms',
    });

    // RegExp variant
    clicks = [];

    await clickNestedText(page, /first/);
    assert.deepStrictEqual(clicks, ['first']);
    
    await clickNestedText(page, /Some.*text/);
    assert.deepStrictEqual(clicks, ['first', 'nested']);

    await clickNestedText(page, /span text/);
    assert.deepStrictEqual(clicks, ['first', 'nested', 'span']);

    await closePage(page);
}

module.exports = {
    description: 'The clickNestedText browser_utils function clicks elements by matching text content',
    resources: [],
    run,
};
