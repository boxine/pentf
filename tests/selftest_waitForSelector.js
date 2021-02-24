const assert = require('assert').strict;

const {closePage, newPage, waitForSelector} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    await page.setContent(`
        <div style="display:none;" id="a"></div>
        <div style="visibility: hidden;" id="b">This is b</div>
        <div id="c" class="foo">this is c</div>
        <div style="display:none;" id="d"></div>
        <div id="e" class="foo">this is e</div>
    `);

    await assert.rejects(waitForSelector(page, '#a', {timeout: 100, message: 'display is none'}), {
        message: 'Element matching  #a  did not become visible within 100ms. display is none',
    });
    await assert.rejects(waitForSelector(page, '#b', {timeout: 100, message: 'visibility is hidden'}), {
        message: 'Element matching  #b  did not become visible within 100ms. visibility is hidden',
    });
    await assert.rejects(waitForSelector(page, '#x404', {timeout: 100, message: '(will not be found)'}), {
        message: 'Failed to find element matching  #x404  within 100ms. (will not be found)',
    });
    await assert.rejects(waitForSelector(page, '#x404nomessage', {timeout: 100}), {
        message: 'Failed to find element matching  #x404nomessage  within 100ms',
    });
    const c = await waitForSelector(page, '#c', {timeout: 1000});
    assert.strictEqual(await page.evaluate(c => c.innerText, c), 'this is c');

    const c2 = await waitForSelector(page, '.foo', {timeout: 1000});
    assert.strictEqual(await page.evaluate(c2 => c2.innerText, c2), 'this is c');

    await closePage(page);
}

module.exports = {
    description: 'Testing browser_utils.waitForSelector.',
    resources: [],
    run,
};
