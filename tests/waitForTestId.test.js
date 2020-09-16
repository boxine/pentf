const assert = require('assert').strict;

const {closePage, newPage, waitForTestId} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    await page.setContent(`
        <div id="foo"></div>
        <div data-testid="bar.">bartext</div>
        <div data-testid="invisible" style="display:none;"></div>
    `);

    await assert.rejects(waitForTestId(page, 'foo', {timeout: 1, extraMessage: 'blabla'}), {
        message: 'Failed to find visible element with data-testid "foo" within 1ms. blabla',
    });

    const bar = await waitForTestId(page, 'bar.');
    assert.strictEqual(await page.evaluate(bar => bar.innerText, bar), 'bartext');

    await assert.rejects(waitForTestId(page, 'invisible', {timeout: 201}));
    await waitForTestId(page, 'invisible', {visible: false, timeout: 1002});

    // Return first element when multiple elements match
    await page.setContent(`
        <div data-testid="baz">baztext</div>
        <div data-testid="baz">booftext</div>
    `);

    const baz = await waitForTestId(page, 'baz');
    assert.strictEqual(await page.evaluate(baz => baz.textContent, baz), 'baztext');

    await closePage(page);
}

module.exports = {
    description: 'The waitForTestId browser_utils function finds an element by its data-testid attribute',
    resources: [],
    run,
};
