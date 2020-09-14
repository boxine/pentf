const { newPage } = require('../browser_utils');

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

            console.log(`[puppeteer] Opening "${config.pentfServerUrl}"`);
            await page.goto(`${config.pentfServerUrl}?client=${name}`);
        },
    };
}

module.exports = {
    createPuppeteerLauncher,
};
