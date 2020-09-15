const assert = require('assert').strict;
const { newPage } = require('../browser_utils');
const output = require('../output');

/**
 * @returns {import('./lifecycle').Plugin}
 */
function createPuppeteerLauncher() {
    const name = 'puppeteer-launcher';

    /** @type {ReturnType<typeof import('../browser_utils').newPage>} */
    let page;

    return {
        name,
        async onRunStart(config) {
            if (!page) {
                page = await newPage(config);
            }

            assert(config.pentfServerUrl, 'Missing "config.pentfServerUrl". Did you forget to add the server plugin?')

            output.log(config, `[puppeteer] Opening "${config.pentfServerUrl}/run"`);
            await page.goto(`${config.pentfServerUrl}/run?client=${name}`);
        },
    };
}

module.exports = {
    createPuppeteerLauncher,
};
