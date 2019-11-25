const assert = require('assert');

const {assertNotXPath, clickXPath, clickText, waitForText, closePage, newPage} = require('../browser_utils');
const {assertEventually} = require('../utils');

async function run(config) {
    const page = await newPage(config);
    await page.setContent('<div id="d1"><div id="d2">test" text \\ " a</div></div>');

    await assert.rejects(assertNotXPath(page, '//div[@id="d2"]', 'extra', 10, 1), {
        message: 'Element matching //div[@id="d2"] is present, but should not be there. extra',
    });
    await assertNotXPath(page, '//div[@id="d3"]');

    await waitForText(page, 'test');
    await waitForText(page, 'test" text \\ " a', {timeout: 10});
    await assert.rejects(waitForText(page, 'foobar', {timeout: 10}), {
        message: 'Unable to find text "foobar" after 10ms',
    });
    await assert.rejects(waitForText(page, 'foo " bar', {timeout: 10}), {
        message: 'Unable to find text "foo \\" bar" after 10ms',
    });

    let clickCount = 0;
    await page.exposeFunction('countClick', () => {
        clickCount++;
    });
    await page.setContent(`<!DOCTYPE html>
        <html>
        <head>
        <script>
        document.addEventListener('DOMContentLoaded', () => {
            const btn = document.createElement('button');
            btn.setAttribute('id', 'clickme');
            btn.appendChild(document.createTextNode('click "this" button'));
            btn.addEventListener('click', countClick);
            document.querySelector('body').appendChild(btn);
        });
        </script>
        </head>
        <body>
        <button id="invisible" style="display:none;">invisible button</button>
        </body>
        </html>
    `);
    await clickXPath(page, '//button[@id="clickme"]');
    assert.strictEqual(clickCount, 1, 'expected 1 click');
    await assert.rejects(clickXPath(page, '//notfound', {timeout: 10}), {
        message: 'Unable to find XPath //notfound after 10ms',
    });
    await assert.rejects(clickXPath(page, '//*[@id="invisible"]', {timeout: 10}), {
        message: 'Unable to find XPath //*[@id="invisible"] after 10ms',
    });
    await assertEventually(() => clickCount === 1);

    await clickText(page, 'click "this" button');
    await assertEventually(() => clickCount === 2, 'Expect 2 clicks');
    await assert.rejects(clickText(page, '404', {timeout: 10}), {
        message: 'Unable to find text "404" after 10ms',
    });
    await assert.rejects(clickText(page, 'invisible button', {timeout: 10}), {
        message: 'Unable to find text "invisible button" after 10ms',
    });
    assert.strictEqual(clickCount, 2);

    await closePage(page);
}

module.exports = {
    description: 'Testing various browser-related helper methods.',
    resources: [],
    run,
};
