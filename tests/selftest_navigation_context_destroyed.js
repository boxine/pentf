const {clickXPath, closePage, newPage} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);

    await page.setContent(`<html><script>
        setTimeout(() => location.href = 'https://google.com/', 1000);
    </script>
    <body>original</body></html>`);
    await clickXPath(page, '//button');

    await closePage(page);
}

module.exports = {
    description: 'Test clickXPath while navigating',
    resources: [],
    run,
    expectedToFail: 'https://github.com/boxine/pentf/issues/127',
};
