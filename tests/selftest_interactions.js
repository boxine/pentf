const assert = require('assert').strict;
const { clickSelector, newPage } = require('../src/browser_utils');

async function run(config) {
    const page = await newPage({ ...config, show_interactions: true });

    const content = `<!DOCTYPE html>
        <html>
        <head>
        <style>
            body {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
            }
        </style>
        </head>
        <body>
            <button>click</button>
        </body>
        </html>
    `;

    await page.setContent(content);

    await clickSelector(page, 'button', { timeout: 1000 });

    let pos = await page.evaluate(() => {
        const el = document.querySelector('#pentf-mouse-pointer');
        return {
            left: +el.style.left.replace('px', ''),
            top: +el.style.top.replace('px', ''),
        };
    });

    assert(pos.left > 100, 'Mouse left position was 0');
    assert(pos.top > 100, 'Mouse top position was 0');

    const tab = await page.browser().newPage();
    await tab.setContent(content);

    await clickSelector(tab, 'button', { timeout: 1000 });

    pos = await tab.evaluate(() => {
        const el = document.querySelector('#pentf-mouse-pointer');
        return {
            left: +el.style.left.replace('px', ''),
            top: +el.style.top.replace('px', ''),
        };
    });

    assert(pos.left > 100, 'Mouse left position was 0');
    assert(pos.top > 100, 'Mouse top position was 0');
}

module.exports = {
    description: 'Show user interactions on the page',
    run,
};
