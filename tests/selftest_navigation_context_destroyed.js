const {clickXPath, closePage, newPage, assertNotXPath, clickSelector, clickNestedText} = require('../browser_utils');

async function run(config) {
    const preparePage = async () => {
        const page = await newPage(config);
        await page.setContent(`<html><script>
            setTimeout(() => location.href = 'https://example.com/', 1000);
        </script>
        <body>original</body></html>`);

        return page;
    };

    // assertNotXPath()
    let page = await preparePage();
    await assertNotXPath(page, '//foobar');

    // clickSelector()
    page = await preparePage();
    await clickSelector(page, 'h1');

    // clickXPath()
    page = await preparePage();
    await clickXPath(page, '//h1');

    // clickNestedText()
    page = await preparePage();
    await clickNestedText(page, /Example Domain/);

    await closePage(page);
}

module.exports = {
    description: 'Test clickXPath, clickSelector, clickXPath and clickNestedText while navigating',
    resources: [],
    run,
};
