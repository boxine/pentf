const {newPage} = require('../../browser_utils');
const {arange} = require('../../utils');

async function run(config) {
    await Promise.all(arange(config.currency === 0 ? 6 : 15).map(async () => {
        const page = await newPage(config);
        await page.goto('https://www.example.org/');
    }));

    throw new Error('Test failed');

    // We would call closePage here, but the test failed already...
}

module.exports = {
    description: 'Fail with many open browsers',
    resources: ['many_browsers'],
    run,
};
