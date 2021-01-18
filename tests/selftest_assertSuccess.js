const assert = require('assert').strict;
const {closePage, newPage, clickNestedText, clickText, clickSelector, clickXPath} = require('../src/browser_utils');

/**
 * @param {(options: {assertSuccess: () => boolean, timeout: number})=> Promise<void>} fn
 */
async function testFn(fn) {
    // Option: assertSuccess, should not pass
    try {
        await fn({
            assertSuccess: () => false,
            timeout: 1
        });
        assert(0);
    } catch (err) {
        assert.match(err.message, /retryUntil/);
    }

    // Custom message
    try {
        await fn({
            assertSuccess: () => {
                throw new Error('fail');
            },
            timeout: 1
        });
        assert(0);
    } catch (err) {
        assert.match(err.message, /fail/);
    }
}

async function run(config) {
    const page = await newPage(config);
    const content = `
        <div>
            <button onclick="pentfClick('first')">first</button>
            <div data-testid="invisible" style="display:none;" onclick="pentfClick('invisible')">invisible</div>
        </div>
    `;
    await page.setContent(content);

    await testFn((options) => clickSelector(page, 'button', options));
    await testFn((options) => clickXPath(page, '//button', options));
    await testFn((options) => clickText(page, 'first', options));
    await testFn((options) => clickNestedText(page, 'first', options));

    // Should succeed when original elements are removed, but the
    // callback function passes.
    let visible = true;
    const retryUntil = async () => {
        if (visible) {
            await page.setContent('<div></div>');
            visible = false;
            return false;
        }
        return true;
    };

    await clickSelector(page, 'button', {retryUntil});

    await page.setContent(content);
    visible = true;
    await clickXPath(page, '//button', {retryUntil});

    await page.setContent(content);
    visible = true;
    await clickText(page, 'first', {retryUntil});

    await page.setContent(content);
    visible = true;
    await clickNestedText(page, 'first', {retryUntil});

    await closePage(page);
}

module.exports = {
    description: 'Test return value of assertSuccess',
    run,
};
