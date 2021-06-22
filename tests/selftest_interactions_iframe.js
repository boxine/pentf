const assert = require('assert').strict;
const {
    clickSelector,
    newPage,
    interceptRequest,
} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage({ ...config, show_interactions: true });
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
                    </style>
                    </head>
                    <body>
                        <div class="wrapper">
                            <div class="inner">
                                <div class="overlay"></div>
                                <button>click</button>
                            </div>
                        </div>
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

    const iframe = await waitForIframe();

    await clickSelector(iframe, 'button', { timeout: 1000 });

    const pos = await page.evaluate(() => {
        const el = document.querySelector('#pentf-mouse-pointer');
        return {
            left: +el.style.left.replace('px', ''),
            top: +el.style.top.replace('px', ''),
        };
    });

    const iframePos = await page.evaluate(() => {
        const el = document.querySelector('iframe');
        const rect = el.getBoundingClientRect();
        return { x: rect.x, y: rect.y };
    });

    assert(pos.left > iframePos.x, 'Mouse left position was 0');
    assert(pos.top > iframePos.y, 'Mouse top position was 0');
}

module.exports = {
    description: 'Show user interactions on the page',
    run,
};
