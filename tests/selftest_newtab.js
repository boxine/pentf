const { newPage, closePage, waitForVisible } = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    await (await page.browser()).newPage();
    await page.goto('https://example.com');
    await waitForVisible(page, 'h1');
    await closePage(page);
}

module.exports = {
    run,
    description: 'Open new tabs without crashing',
};
