const assert = require('assert').strict;
const {clickSelector, newPage} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage({...config, show_interactions: true});

    const content = `<!DOCTYPE html>
        <html>
        <head>
        <meta http-equiv="Content-Security-Policy" content="require-trusted-types-for 'script'; trusted-types;"></meta>
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

    await clickSelector(page, 'button', {timeout: 1000});

    const isPresent = await page.evaluate(() => {
        return document.querySelector('#pentf-mouse-pointer') !== null;
    });

    assert(!isPresent, 'Interaction ui was injected, despite TrustedHTML warning');
}

module.exports = {
    description: 'Skip injecting user interactions on the page when TrustedHTML is enabled',
    run,
};
