const assert = require('assert').strict;

const {newPage, waitForXPathGone} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    await page.setContent(`
        <div class="foo"></div>
    `);

    await assert.rejects(waitForXPathGone(page, '//div', {timeout: 1, message: 'blabla'}), {
        message: 'Element matching //div is present, but should not be there. blabla',
    });

    await Promise.all([
        waitForXPathGone(page, '//div'),
        page.evaluate(() => {
            document.querySelector('.foo').remove();
        })
    ]);
}

module.exports = {
    description: 'The waitForXPathGone browser_utils waits until no element with xpath can be found',
    run,
};
