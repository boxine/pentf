const assert = require('assert').strict;
const {newPage, interceptRequest, waitForSelector} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage({...config, show_interactions: true});
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
        const iframe = page.frames().find(f => page.mainFrame() !== f && f.url().includes('pentf.dev'));
        await iframe.waitForSelector('button');
        return iframe;
    };

    const iframe = await waitForIframe();

    try {
        await waitForSelector(iframe, 'do-not-exist', { timeout: 500 });
        throw new Error('fail');
    } catch (err) {
        assert.match(err.message, /do-not-exist/);
    }
}

module.exports = {
    description: 'Enhance frame errors',
    run,
};
