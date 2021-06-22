const assert = require('assert').strict;

const { newPage, waitForTestIdGone } = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    await page.setContent(`
        <div data-testid="foo"></div>
        <div data-testid="bar">bartext</div>
    `);

    await assert.rejects(
        waitForTestIdGone(page, 'foo', { timeout: 1, message: 'blabla' }),
        {
            message:
                'Element matching [data-testid="foo"] is present, but should not be there. blabla',
        }
    );

    await Promise.all([
        waitForTestIdGone(page, 'foo'),
        page.evaluate(() => {
            document.querySelector('[data-testid="foo"]').remove();
        }),
    ]);
}

module.exports = {
    description:
        'The waitForTestIdGone browser_utils waits until no element with data-testid attribute can be found',
    run,
};
