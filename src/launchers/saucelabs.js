const SaucelabsApi = require('saucelabs').default;
const {remote} = require('webdriverio');
const assert = require('assert').strict;

/**
 * @typedef {{startConnect?: boolean, username: string, accessKey: string}} SaucelabsOptions
 */

/**
 * @param {SaucelabsOptions} options
 * @returns {import('../config').Launcher}
 */
async function createSaucelabsLauncher(options) {
    const seleniumCapabilities = {};

    /** @type {Promise<import('saucelabs').SauceConnectInstance>} */
    let tunnelPromise;
    /** @type {WebdriverIO.BrowserObject} */
    let driver;
    /** @type {SaucelabsApi} */
    let api;

    async function init() {
        if (!tunnelPromise && options.startConnect) {
            api = new SaucelabsApi();
            tunnelPromise = api.startSauceConnect({
                logger: msg => console.log('Saucelabs', msg),
            });
        }

        await tunnelPromise;
    }

    async function onStartRun(config) {
        if (!driver) {
            driver = await remote(seleniumCapabilities);
        }

        assert(config.serverUrl, 'Missing "config.serverUrl" option.');
        await driver.url(config.serverUrl);
    }

    async function onCompleteRun() {
        if (driver) {
            await driver.deleteSession();
        }
    }

    async function shutdown() {
        if (tunnelPromise) {
            const tunnel = await tunnelPromise;
            await tunnel.close();
        }
    }

    return {init, shutdown, onStartRun, onCompleteRun};
}

module.exports = {
    createSaucelabsLauncher,
};
