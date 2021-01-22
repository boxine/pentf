const assert = require('assert').strict;

const {closePage, newPage, clickNestedText} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);

    await page.setContent(`
        <script>
            window.clicks = [];
            function pentfClick(id) {
                window.clicks.push(id);
            }
        </script>
        <div>
            <button onclick="pentfClick('first')">first</button>
            <button onclick="pentfClick('nested')">Some <span>nested <b>foo</b></span></button>
            <div>Some <span onclick="pentfClick('span')">span <b>text</b></span></div>
            <div data-testid="invisible" style="display:none;" onclick="pentfClick('invisible')">invisible</div>
        </div>
    `);

    const getClicks = async () => page.evaluate(() => window.clicks);
    const resetClicks = async () => page.evaluate(() => (window.clicks = []));

    // String variant
    await clickNestedText(page, 'first');
    assert.deepStrictEqual(await getClicks(), ['first']);

    await clickNestedText(page, 'Some nested foo');
    assert.deepStrictEqual(await getClicks(), ['first', 'nested']);

    await resetClicks();
    await assert.rejects(clickNestedText(page, 'not-present', {timeout: 1, extraMessage: 'blabla'}), {
        message: 'Unable to find visible text "not-present" after 1ms (blabla)',
    });
    assert.deepStrictEqual(await getClicks(), []);

    await assert.rejects(clickNestedText(page, 'invisible', {timeout: 43}), {
        message: 'Unable to find visible text "invisible" after 43ms',
    });

    // RegExp variant
    await resetClicks();

    await clickNestedText(page, /first/);
    assert.deepStrictEqual(await getClicks(), ['first']);

    await clickNestedText(page, /Some.*foo/);
    assert.deepStrictEqual(await getClicks(), ['first', 'nested']);

    await clickNestedText(page, /span text/);
    assert.deepStrictEqual(await getClicks(), ['first', 'nested', 'span']);

    // Edge case
    await resetClicks();
    await page.setContent(`
        <html>
            <body>
                <button onclick="pentfClick('clickme')">clickme</button>
            </body>
        </html>
    `);
    await clickNestedText(page, 'clickme');
    assert.deepStrictEqual(await getClicks(), ['clickme']);

    await resetClicks();
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
    assert.deepStrictEqual(await getClicks(), ['clickme', 'clickme']);

    // Option: assertSuccess
    let success = false;
    let called = false;
    await clickNestedText(page, /^clickme/, {
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
    description: 'The clickNestedText browser_utils function clicks elements by matching text content',
    resources: [],
    run,
};
