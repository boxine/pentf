const assert = require('assert').strict;
const {closePage, newPage, clickText} = require('../src/browser_utils');

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
            <div data-testid="invisible" style="display:none;" onclick="pentfClick('invisible')">invisible</div>
        </div>
    `);

    const getClicks = async () => page.evaluate(() => window.clicks);
    const resetClicks = async () => page.evaluate(() => (window.clicks = []));

    // String variant
    await clickText(page, 'first');
    assert.deepStrictEqual(await getClicks(), ['first']);

    await resetClicks();
    await assert.rejects(clickText(page, 'not-present', {timeout: 1, extraMessage: 'blabla'}), {
        message: 'Unable to find text "not-present" after 1ms (blabla)',
    });
    assert.deepStrictEqual(await getClicks(), []);

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

    assert.deepStrictEqual(await getClicks(), ['first', 'first']);

    await closePage(page);
}

module.exports = {
    description: 'The clickText browser_utils function clicks elements by matching direct text content',
    resources: [],
    run,
};
