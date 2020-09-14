const SaucelabsApi = require('saucelabs').default;
const {remote} = require('webdriverio');
const { onStartRun, onFinishRun, onShutdown } = require('./lifecycle');
const config = require('../config');

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
                name: config.name || 'Saucelabs Launcher',
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
 * @returns {(config: import('../config').Config) => Promise<void>}
 */
async function createSaucelabsLauncher(options) {
    const tunnelIdentifier = 'pentf-saucelabs-' + Math.round(new Date().getTime() / 1000);

    return async config => {
        if (!options.startConnect) return;

        /** @type {Promise<import('saucelabs').SauceConnectInstance>} */
        let tunnelPromise;
        /** @type {WebdriverIO.BrowserObject} */
        let driver;

        if (config.pentfServerUrl) {
            options.browsers.forEach(browser => {
                const seleniumOptions = createCapabilities(options, browser, tunnelIdentifier);

                onStartRun(config, async () => {
                    if (!tunnelPromise) {
                        const api = new SaucelabsApi({
                            user: options.username,
                            key: options.accessKey,
                        });
                        tunnelPromise = api.startSauceConnect({
                            tunnelIdentifier,
                            logger: msg => console.log('Saucelabs', msg),
                        });
                    }
                    await tunnelPromise;

                    if (!driver) {
                        driver = await remote(seleniumOptions);
                    }

                    const browserName = getBrowserName(browser);
                    console.log(`[saucelabs] ${browserName} session at https://saucelabs.com/tests/${driver.sessionId}`);
                    console.log(`[saucelabs] Opening "${config.pentfServerUrl}" on the selenium client`);
                    await driver.url(config.pentfServerUrl);
                });

                onFinishRun(config, async () => {
                    if (driver) {
                        await driver.deleteSession();
                    }
                });
            });
        }

        onShutdown(config, async () => {
            if (tunnelPromise) {
                const tunnel = await tunnelPromise;
                await tunnel.close();
            }
        });
    };
}

module.exports = {
    createSaucelabsLauncher,
};
