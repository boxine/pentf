const assert = require('assert').strict;

const {clickSelector, closePage, newPage} = require('../browser_utils');
const {assertEventually} = require('../utils');

async function run(config) {
    const page = await newPage(config);

    const clicks = [];
    await page.exposeFunction('registerClick', id => clicks.push(id));
    await page.setContent(`<!DOCTYPE html>
        <html>
        <head>
        <script>
        function flagClick(e) {
            registerClick(e.target.getAttribute('id'));
        }

        document.addEventListener('DOMContentLoaded', () => {
            const body = document.querySelector('body');

            const btn = document.createElement('button');
            btn.setAttribute('id', 'clickme');
            btn.appendChild(document.createTextNode('click "this" button'));
            btn.addEventListener('click', flagClick);
            body.appendChild(btn);

            document.querySelector('#invisible').addEventListener('click', flagClick);
        });
        </script>
        </head>
        <body>
        <button id="invisible" style="display:none;">invisible button</button>
        </body>
        </html>
    `);

    await clickSelector(page, 'button#clickme', {timeout: 1000});
    await assertEventually(() => {
        assert.deepStrictEqual(clicks, ['clickme']);
        return true;
    }, {crashOnError: false, timeout: 1000});

    await assert.rejects(
        clickSelector(
            page, '#notfound',
            {timeout: 100, message: 'Could not click something that does not exist'}),
        {message: 'Could not click something that does not exist'}
    );

    await assert.rejects(
        clickSelector(page, '#invisible', {timeout: 100}),
        {message: 'Unable to find visible element #invisible after 100ms'}
    );
    await clickSelector(page, '#invisible', {visible: false, timeout: 1000});
    await assertEventually(() => {
        assert.deepStrictEqual(clicks, ['clickme', 'invisible']);
        return true;
    }, {crashOnError: false, timeout: 1000});

    await assert.rejects(
        clickSelector(page, 'invalid['),
        e => e.stack.includes("'invalid[' is not a valid selector")
    );

    await closePage(page);
}

module.exports = {
    description: 'browser_utils.clickSelector to atomically click an element by query selector',
    resources: [],
    run,
};
