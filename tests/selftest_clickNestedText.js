const assert = require('assert');

const {closePage, newPage, clickNestedText} = require('../browser_utils');

async function run(config) {
    const page = await newPage(config);
    let clicks = [];

    await page.setContent(`
        <div>
            <button onclick="pentfClick('first')">first</button>
            <button onclick="pentfClick('nested')">Some <span>nested <b>foo</b></span></button>
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

    await clickNestedText(page, 'Some nested foo');
    assert.deepStrictEqual(clicks, ['first', 'nested']);

    clicks = [];
    await assert.rejects(
        clickNestedText(page, 'not-present', {timeout: 1, extraMessage: 'blabla'}),
        {
            message: 'Unable to find visible text "not-present" after 1ms (blabla)',
        }
    );
    assert.deepStrictEqual(clicks, []);

    await assert.rejects(clickNestedText(page, 'invisible', {timeout: 43}), {
        message: 'Unable to find visible text "invisible" after 43ms',
    });

    // RegExp variant
    clicks = [];

    await clickNestedText(page, /first/);
    assert.deepStrictEqual(clicks, ['first']);

    await clickNestedText(page, /Some.*foo/);
    assert.deepStrictEqual(clicks, ['first', 'nested']);

    await clickNestedText(page, /span text/);
    assert.deepStrictEqual(clicks, ['first', 'nested', 'span']);

    // Edge case
    clicks = [];
    await page.setContent(`
        <html>
            <body>
                <button onclick="pentfClick('clickme')">clickme</button>
            </body>
        </html>
    `);
    await clickNestedText(page, 'clickme');
    assert.deepStrictEqual(clicks, ['clickme']);

    clicks = [];
    await page.setContent(`
        <html>
            <body>
                <div>click</div>
                foo
                <span>
                    foo
                    <button onclick="pentfClick('clickme')">clickme foo</button>
                </span>
            </body>
        </html>
    `);
    await clickNestedText(page, /^clickme/);
    await clickNestedText(page, /foo$/);
    assert.deepStrictEqual(clicks, ['clickme', 'clickme']);

    await closePage(page);
}

module.exports = {
    description:
        'The clickNestedText browser_utils function clicks elements by matching text content',
    resources: [],
    run,
};
