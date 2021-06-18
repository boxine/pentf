const {newPage, waitForSelector, clickText} = require('../../src/browser_utils');

async function run(config) {
    const page = await newPage(config);

    await page.goto('https://example.com');
    await waitForSelector(page, 'div');
    await waitForSelector(page, 'h1');
    await clickText(page, 'example');
}

module.exports = {
    description: 'Test breadcrumb trace',
    run,
};
