const { newPage, assertAccessibility } = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    await page.setContent(
        '<div style="width: 300px; height: 300px; background: red;"><blink></blink></div>'
    );

    try {
        await assertAccessibility(config, page);
    } catch (err) {
        if (!/5 accessibility violations/.test(err.message)) {
            throw err;
        }
    }
}

module.exports = {
    description: 'Test accessibility violations',
    run,
};
