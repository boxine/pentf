const { newPage } = require('../../src/browser_utils');

async function run(config) {
    const page = await newPage(config);

    await page.goto('https://example.com');

    throw new Error('fail');
}

module.exports = {
    description: 'Test with page to show url in logs',
    run,
};
