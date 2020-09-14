const SaucelabsApi = require('saucelabs').default;
const {remote} = require('webdriverio');

/**
 * @typedef {{name: string, version?: string, platform?: string}} SaucelabsBrowser
 */

/**
 * @typedef {{startConnect?: boolean, username: string, accessKey: string, browsers: SaucelabsBrowser[]} & Partial<SauceCapabilities>} SaucelabsOptions
 */

/**
 * @typedef {{build: string, commandTimeout: number, customData: Record<string, any>, idleTimeout: number, maxDuration: number, name: string, parentTunnel?: any, public: string, recordScreenshots: boolean, recordVideo: boolean, tags: string[], tunnelIdentifier: string, "custom-data": any}} SauceCapabilities
 */

/**
 * @typedef {user: string, accessKey: string, region?: string, headless?: boolean, logLevel: 'error', capabilities: { 'sauce:options': SauceCapabilities }} SeleniumCapabilities
 */

/**
 * @param {SaucelabsBrowser} browser
 */
function getBrowserName(browser) {
    return `${browser.name} ${browser.version || 'latest'} (${browser.platform || 'Windows 10'})`;
}

/**
 * @param {SaucelabsOptions} options
 * @param {SaucelabsBrowser} browser
 * @returns {SeleniumCapabilities}
 */
function createCapabilities(options, browser, tunnelIdentifier) {
    return {
        user: options.username,
        accessKey: options.accessKey,
        region: undefined,
        headless: false,
        logLevel: 'error',
        capabilities: {
            browserName: browser.name,
            browserVersion: browser.version || 'latest',
            platformName: browser.platform || 'Windows 10',
            'sauce:options': {
                build: options.build,
                commandTimeout: options.commandTimeout || 300,
                customData: options.customData || {},
                idleTimeout: options.idleTimeout || 90,
                maxDuration: options.maxDuration || 1000,
                name: options.name || 'Saucelabs Launcher',
                parentTunnel: options.parentTunnel,
                public: options.public || 'public',
                recordScreenshots: options.recordScreenshots,
                recordVideo: options.recordVideo,
                tags: options.tags || [],
                tunnelIdentifier,
            },
        },
    };
}

/**
 * @param {SaucelabsOptions} options
 */
function createSaucelabsLauncher(options) {
    const tunnel = {
        id: 'pentf-saucelabs-' + Math.round(new Date().getTime() / 1000),
        /** @type {Promise<import('saucelabs').SauceConnectInstance>} */
        promise: undefined
    };

    return browser => createSauceBrowser(options, browser, tunnel);
}

/**
 * @param {SaucelabsOptions} options
 * @param {{id: string, promise: Promise<import('saucelabs').SauceConnectInstance>}} tunnel
 */
function createSauceBrowser(options, browser, tunnel) {
    /** @type {WebdriverIO.BrowserObject} */
    let driver;

    return {
        name: 'saucelabs-launcher',
        async onRunStart(config) {
            if (!tunnel.promise) {
                const api = new SaucelabsApi({
                    user: options.username,
                    key: options.accessKey,
                });
                tunnel.promise = api.startSauceConnect({
                    tunnelIdentifier: tunnel.id,
                    logger: msg => console.log('Saucelabs', msg),
                });
            }
            await tunnel.promise;

            if (!driver) {
                const seleniumOptions = createCapabilities(options, browser, tunnel.id);
                driver = await remote(seleniumOptions);

                const browserName = getBrowserName(browser);
                console.log(`[saucelabs] ${browserName} session at https://saucelabs.com/tests/${driver.sessionId}`);
                console.log(`[saucelabs] Opening "${config.pentfServerUrl}" on the selenium client`);
                await driver.url(config.pentfServerUrl);
            }
        },
        async onRunEnd() {
            if (driver) {
                await driver.deleteSession();
            }
        },
        async onShutdown() {
            if (tunnel.promise) {
                const instance = await instance.promise;
                await instance.close();
            }
        }
    };
}

module.exports = {
    createSaucelabsLauncher,
};
