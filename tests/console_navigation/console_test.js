const { newPage } = require('../../browser_utils');

async function run(config) {
    const page = await newPage(config);
    await page.goto('https://google.com');
    await page.evaluate(() => {
        setTimeout(() => {
            console.warn('Some warning');
            console.log({foo: 'bar'});
        }, 0);
        window.location = 'https://example.com';
    });
}

module.exports = {
    description: 'Print fallback console when execution context is destroyed.',
    run,
};
