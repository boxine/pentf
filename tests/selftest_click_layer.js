const assert = require('assert').strict;
const {clickSelector, newPage, clickXPath, clickNestedText} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);

    await page.setContent(`<!DOCTYPE html>
        <html>
        <head>
        <style>
            body {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
            }

            .overlay {
                position: absolute;
                z-index: 100;
                top: 2rem;
                left: 2rem;
                right: 2rem;
                bottom: 2rem;
                background: rgba(255, 0, 0, 0.5);
            }
        </style>
        </head>
        <body>
            <div class="overlay"></div>
            <button>click</button>
            <script>
                window.overlayClicks = 0;
                window.buttonClicks = 0;

                const btn = document.querySelector('button');
                btn.appendChild(document.createTextNode(' me'));
                btn.addEventListener('click', () => {
                    window.buttonClicks++;
                });

                const overlay = document.querySelector('.overlay');
                overlay.addEventListener('click', () => {
                    window.overlayClicks++;
                });
            </script>
        </body>
        </html>
    `);

    const getClicks = async () => page.evaluate(() => {
        return { overlay: window.overlayClicks, button: window.buttonClicks };
    });

    // All following assertions check that the overlay div that is positioned
    // above the button intercepts all click events, so that none are triggered
    // on the button.

    await clickSelector(page, 'button', {timeout: 1000});
    let clicks = await getClicks();
    assert.equal(clicks.button, 0);
    assert.equal(clicks.overlay, 1);

    // Click element
    await clickXPath(page, '//button', {timeout: 1000});
    clicks = await getClicks();
    assert.equal(clicks.button, 0);
    assert.equal(clicks.overlay, 2);

    // Click text node
    await clickXPath(page, '//button/text()[2]', {timeout: 1000});
    clicks = await getClicks();
    assert.equal(clicks.button, 0);
    assert.equal(clicks.overlay, 3);

    // Click text node
    await clickNestedText(page, 'click me', {timeout: 1000});
    clicks = await getClicks();
    assert.equal(clicks.button, 0);
    assert.equal(clicks.overlay, 4);
}

module.exports = {
    description: 'Simulates clicks via a mouse like a user would',
    run,
};
