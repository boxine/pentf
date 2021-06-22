const assert = require('assert').strict;

const {
    closePage,
    newPage,
    createUserProfileDir,
} = require('../src/browser_utils');

async function run(config) {
    const dir = await createUserProfileDir(config);

    const page = await newPage(config, ['--user-data-dir=' + dir]);
    await page.goto('https://example.com');

    let value = await page.evaluate(() => {
        return window.localStorage.getItem('foo');
    });
    assert.equal(value, null);

    await page.evaluate(() => {
        window.localStorage.setItem('foo', 'foobar');
    });
    await closePage(page);

    const page2 = await newPage(config, ['--user-data-dir=' + dir]);
    await page2.goto('https://example.com');
    value = await page2.evaluate(() => {
        return window.localStorage.getItem('foo');
    });
    assert.equal(value, 'foobar');

    // Create 2nd dir
    const dir2 = await createUserProfileDir(config);
    const page3 = await newPage(config, ['--user-data-dir=' + dir2]);
    await page3.goto('https://example.com');
    value = await page3.evaluate(() => {
        return window.localStorage.getItem('foo');
    });

    // Check if value doesn't leak from previous user data dir
    assert.equal(value, null);
}

module.exports = {
    description: 'Create temporary user data dir',
    run,
};
