const { assertEventually } = require('../src/assert_utils');
const { closePage, newPage, waitForText } = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config, [
        '--disable-features=IsolateOrigins,site-per-process',
    ]);
    await page.setContent(`
        This is a webpage which loads an iframe
        <script>
        const iframe = document.createElement('iframe');
        iframe.src = 'https://example.org/';
        document.body.appendChild(iframe);
        </script>`);

    const exampleFrame = await assertEventually(() =>
        page
            .frames()
            .find(frame => frame.url().startsWith('https://example.org/'))
    );
    await waitForText(exampleFrame, 'Example Domain');

    await closePage(page);
}

module.exports = {
    description: 'Accessing content in iframes at other domains',
    resources: [],
    run,
};
