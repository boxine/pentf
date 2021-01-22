const assert = require('assert').strict;

const {closePage, newPage, clickXPath} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);

    const clicks = [];
    await page.exposeFunction('registerClick', id => clicks.push(id));
    await page.setContent(`<!DOCTYPE html>
        <button id="first">click me</button>
        <div id="second"></div>
        <script>
            window.clicks = [];
            ["first", "second"].forEach(id => {
                const el = document.getElementById(id);
                el.addEventListener("click", e => window.clicks.push(e.target.id));
            })
        </script>
    `);

    const getClicks = async () => page.evaluate(() => window.clicks);
    assert.rejects(clickXPath(page, '//foo', { timeout: 1 }));
    assert.deepStrictEqual(await getClicks(), []);

    assert.rejects(clickXPath(page, '//foo', { timeout: 1, message: 'blabla' }), {
        message: 'blabla'
    });
    assert.deepStrictEqual(await getClicks(), []);

    await clickXPath(page, '//button');
    assert.deepStrictEqual(await getClicks(), ['first']);

    // Option: assertSuccess
    let success = false;
    let called = false;
    await clickXPath(page, '//button', {
        assertSuccess: () => {
            called = true;
            const old = success;
            success = !success;
            return old;
        }
    });
    assert(called, 'assertSuccess was not invoked');

    await closePage(page);
}

module.exports = {
    description: 'browser_utils.clickXPath to atomically click an element by query selector',
    resources: [],
    run,
};
