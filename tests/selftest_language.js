const assert = require('assert').strict;
const http = require('http');
const {newPage, closePage, setLanguage} = require('../src/browser_utils');

async function run(config) {
    const server = http.createServer((req, res) => {
        res.end('Hello World!');
    });
    const port = await new Promise((resolve, reject) => {
        server.listen(0, (err) => {
            if (err) return reject(err);

            const {port} = server.address();
            return resolve(port);
        });
    });
    const page = await newPage(config);
    await page.goto(`http://localhost:${port}/`);

    await setLanguage(page, 'de-DE');
    await page.reload();
    let lang = await page.evaluate(() => window.navigator.language);
    assert.equal(lang, 'de-DE');

    await setLanguage(page, 'en-US');
    await page.reload();
    lang = await page.evaluate(() => window.navigator.language);
    assert.equal(lang, 'en-US');

    await closePage(page);
}

module.exports = {
    run,
    description: 'Set browser language',
};
