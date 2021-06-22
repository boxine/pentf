const { newPage, interceptRequest } = require('../../src/browser_utils');

async function run(config) {
    const page = await newPage(config, [
        '--disable-features=IsolateOrigins,site-per-process',
    ]);
    await interceptRequest(page, request => {
        if (request.url() === 'https://example.com') {
            request.respond({
                body: '<h1>Popup</h1>',
                contentType: 'text/html',
            });
        } else {
            request.continue();
        }
    });
    page.setContent(`
        <a href="https://example.com" target="_blank">link</a>
    `);

    const [popup] = await Promise.all([
        new Promise(resolve => page.once('popup', resolve)),
        page.click('a[target=_blank]'),
    ]);

    await popup.waitForSelector('h1', { timeout: 1500 });

    throw new Error('fail');
}

module.exports = {
    description: 'Force popup screenshot generation',
    run,
};
