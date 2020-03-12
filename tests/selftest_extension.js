const assert = require('assert');
const path = require('path');
const {closePage, newPage} = require('../browser_utils');

async function run(config) {
    const page = await newPage({
        ...config,
        headless: false, // Extensions are not loaded in headless mode
        extensions: [path.join(__dirname, 'fixtures', 'extension')]
    });

    // Extension can't be injected into toplevel about:blank page.
    await page.goto('https://www.example.org/');
    const text = await page.evaluate(() => document.body.textContent);

    assert.equal(text, 'Hello World!');

    await closePage(page);
}

module.exports = {
    description: 'Check if an unpacked browser extension can be loaded',
    resources: [],
    run,
};
