const assert = require('assert').strict;

const {closePage, newPage, typeSelector} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    await page.setContent(`
        <script>
        setTimeout(() => {
            const input = document.createElement('input');
            input.setAttribute('id', 'input');
            document.body.appendChild(input);
        }, 1000);
        </script>`);
    await typeSelector(page, '#input', 'foobar');

    const value = await page.evaluate(() => document.querySelector('#input').value);
    assert.equal(value, 'foobar');

    await closePage(page);
}

module.exports = {
    description: 'browser_utils.typeSelector to type text into an <input> element',
    resources: [],
    run,
};
