const assert = require('assert');

const {closePage, newPage, getAttribute, getText} = require('../browser_utils');

async function run(config) {
    const page = await newPage(config);
    await page.setContent(`
        <div style="display:none;" id="a"></div>
        <input type="checkbox" checked="checked" />
        <p>Hello <span>World!</span></p>
    `);

    assert.strictEqual(await getAttribute(page, 'div', 'id'), 'a');

    // Special case for style
    assert.strictEqual(await getAttribute(page, 'div', 'style'), 'display: none;');

    // Get correct type
    assert.strictEqual(await getAttribute(page, 'input', 'checked'), true);

    // Text content
    assert.strictEqual(await getText(page, 'p'), 'Hello World!');

    await closePage(page);
}

module.exports = {
    description: 'Testing browser_utils.waitForVisible.',
    resources: [],
    run,
};
