const assert = require('assert').strict;
const {
    clickSelector,
    newPage,
    clickXPath,
    clickNestedText,
    interceptRequest,
} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    await interceptRequest(page, req => {
        if (req.url().endsWith('pentf.dev/')) {
            return req.respond({
                content: 'text/html',
                body: `<!DOCTYPE html>
                    <html>
                    <head>
                    <style>
                        iframe {
                            margin-top: 4rem;
                        }
                    </style>
                    </head>
                    <body>
                        <iframe width="640" height="480" src="http://pentf.dev/iframe.html" />
                    </body>
                    </html>
                `,
            });
        } else if (req.url().endsWith('/iframe.html')) {
            return req.respond({
                content: 'text/html',
                body: `<!DOCTYPE html>
                    <html>
                    <head>
                    <style>
                        .wrapper {
                            height: 150px;
                            overflow: scroll;
                        }

                        .inner {
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 400px;
                            position: relative;
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
                        <div class="wrapper">
                            <div class="inner">
                                <div class="overlay"></div>
                                <button>click</button>
                            </div>
                        </div>
                        <script>
                            window.top.overlayClicks = 0;
                            window.top.buttonClicks = 0;

                            const btn = document.querySelector('button');
                            btn.appendChild(document.createTextNode(' me'));
                            btn.addEventListener('click', () => {
                                window.top.buttonClicks++;
                            });

                            const overlay = document.querySelector('.overlay');
                            overlay.addEventListener('click', () => {
                                window.top.overlayClicks++;
                            });
                        </script>
                    </body>
                    </html>
                `,
            });
        }
    });

    await page.goto('http://pentf.dev');

    const waitForIframe = async () => {
        const iframe = page
            .frames()
            .find(f => page.mainFrame() !== f && f.url().includes('pentf.dev'));
        await iframe.waitForSelector('button');
        return iframe;
    };

    let iframe = await waitForIframe();

    const getClicks = async () =>
        page.evaluate(() => {
            return {
                overlay: window.overlayClicks,
                button: window.buttonClicks,
            };
        });

    // All following assertions check that the overlay div that is positioned
    // above the button intercepts all click events, so that none are triggered
    // on the button.
    await clickSelector(iframe, 'button', { timeout: 1000 });
    let clicks = await getClicks();
    assert.equal(clicks.button, 0);
    assert.equal(clicks.overlay, 1);

    // Click element
    await page.reload();
    iframe = await waitForIframe();
    await clickXPath(iframe, '//button', { timeout: 1000 });
    clicks = await getClicks();
    assert.equal(clicks.button, 0);
    assert.equal(clicks.overlay, 1);

    // Click text node
    await page.reload();
    iframe = await waitForIframe();
    await clickXPath(iframe, '//button/text()[2]', { timeout: 1000 });
    clicks = await getClicks();
    assert.equal(clicks.button, 0);
    assert.equal(clicks.overlay, 1);

    // Click text node
    await page.reload();
    iframe = await waitForIframe();
    await clickNestedText(iframe, 'click me', { timeout: 1000 });
    clicks = await getClicks();
    assert.equal(clicks.button, 0);
    assert.equal(clicks.overlay, 1);
}

module.exports = {
    description:
        'Simulates clicks via a mouse like a user would inside an iframe',
    run,
};
