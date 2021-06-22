const {
    clickXPath,
    newPage,
    waitForVisible,
    waitForText,
    waitForTestId,
    assertNotXPath,
    clickSelector,
    assertNotSelector,
    clickText,
    clickNestedText,
    clickTestId,
    assertNotTestId,
} = require('../src/browser_utils');

async function reset(page) {
    await page.goto('about:blank');
    const html = `
        <html>
            <script>
                setTimeout(() => location.href = 'https://example.com/', 1000);
            </script>
            <body>original</body>
        </html>
    `;
    await page.setContent(html);
}

async function run(config) {
    const page = await newPage({ ...config, default_timeout: 3000 });

    await reset(page);
    await clickXPath(page, '//h1');

    await reset(page);
    await waitForVisible(page, 'h1');

    await reset(page);
    await waitForText(page, 'Example');

    await reset(page);
    await page.evaluate(() => {
        const div = document.createElement('div');
        div.setAttribute('data-testid', 'foo');
        document.body.appendChild(div);
    });
    await waitForTestId(page, 'foo');

    await reset(page);
    await assertNotXPath(page, '//foo');

    await reset(page);
    await clickSelector(page, 'h1');

    await reset(page);
    await assertNotSelector(page, 'h10');

    await reset(page);
    await clickText(page, 'More information');

    await reset(page);
    await clickNestedText(page, 'Example');

    await reset(page);
    await page.evaluate(() => {
        const div = document.createElement('div');
        div.setAttribute('data-testid', 'foo');
        document.body.appendChild(div);
    });
    await clickTestId(page, 'foo');

    await reset(page);
    await assertNotTestId(page, 'foo');
}

module.exports = {
    description: 'Test clickXPath while navigating',
    resources: [],
    run,
};
