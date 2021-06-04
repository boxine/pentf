const assert = require('assert').strict;

const {newPage, waitForSelectorGone} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    await page.setContent(`
        <div class="foo"></div>
        <div class="bar">bartext</div>
    `);

    await assert.rejects(waitForSelectorGone(page, '.foo', {timeout: 1, message: 'blabla'}), {
        message: 'Element matching .foo is present, but should not be there. blabla',
    });

    await Promise.all([
        waitForSelectorGone(page, '.foo'),
        page.evaluate(() => {
            document.querySelector('.foo').remove();
        })
    ]);
}

module.exports = {
    description: 'The waitForSelectorGone browser_utils waits until no element with selector can be found',
    run,
};
