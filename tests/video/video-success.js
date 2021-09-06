const { newPage } = require('../../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    await page.goto('https://example.com', { waitUntil: ['networkidle0'] });

    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
        page.click('a'),
    ]);
}

module.exports = {
    description: 'Record a video of the page',
    run,
};
