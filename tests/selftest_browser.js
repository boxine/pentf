const assert = require('assert');

const {assertNotXPath, waitForText, closePage, newPage} = require('../browser_utils');

async function run(config) {
    const page = await newPage(config);
    await page.setContent('<div id="d1"><div id="d2">test" text \\ " a</div></div>');

    await assert.rejects(assertNotXPath(page, '//div[@id="d2"]', 'extra', 10, 1), {
        message: 'Element matching //div[@id="d2"] is present, but should not be there. extra',
    });
    await assertNotXPath(page, '//div[@id="d3"]', '', 10, 1);

    await waitForText(page, 'test', {timeout: 10});
    await waitForText(page, 'test" text \\ " a', {timeout: 10});
    await assert.rejects(waitForText(page, 'foobar', {timeout: 10}), {
        message: 'Unable to find text "foobar" after 10ms',
    });
    await assert.rejects(waitForText(page, 'foo " bar', {timeout: 10}), {
        message: 'Unable to find text "foo \\" bar" after 10ms',
    });

    await closePage(page);
}

module.exports = {
    description: 'Testing various browser-related helper methods.',
    resources: [],
    run,
};
