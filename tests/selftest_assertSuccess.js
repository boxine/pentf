const assert = require('assert').strict;
const {closePage, newPage, clickText} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    await page.setContent(`
        <div>
            <button onclick="pentfClick('first')">first</button>
            <div data-testid="invisible" style="display:none;" onclick="pentfClick('invisible')">invisible</div>
        </div>
    `);

    // Option: assertSuccess, should not pass
    assert.rejects(clickText(page, 'first', {
        assertSuccess: () => false,
        timeout: 1
    }));

    await closePage(page);
}

module.exports = {
    description: 'Test return value of assertSuccess',
    run,
};
