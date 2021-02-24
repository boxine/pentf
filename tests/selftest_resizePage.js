const assert = require('assert').strict;
const {newPage, resizePage} = require('../src/browser_utils');
const {assertEventually} = require('../src/assert_utils');

async function run(config) {
    const page = await newPage(config);

    const size = await page.evaluate(() => {
        return {width: window.innerWidth, height: window.innerHeight};
    });
    assert.deepEqual(size, {width: 800, height: 600});

    await resizePage(config, page, {width: 1280, height: 900});

    await assertEventually(async () => {
        return await page.evaluate(() => {
            return window.innerWidth === 1280 && window.innerHeight === 900;
        });
    });
}

module.exports = {
    run,
    description: 'Resize window to ensure page matches specified dimensions',
};
