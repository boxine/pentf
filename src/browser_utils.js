'use strict';
/**
 * Browser functions, based upon puppeteer.
 * These functions extend [the puppeteer API](https://github.com/puppeteer/puppeteer/blob/master/docs/api.md).
 * @packageDocumentation
 */

const assert = require('assert').strict;
const fs = require('fs');
const path = require('path');
const {promisify} = require('util');
const tmp = require('tmp-promise');
const {performance} = require('perf_hooks');
const mkdirpCb = require('mkdirp');
const {PNG} = require('pngjs');
const pixelmatch = require('pixelmatch');
const sharp = require('sharp');
const rimraf = require('rimraf');

const {assertAsyncEventually} = require('./assert_utils');
const {forwardBrowserConsole} = require('./browser_console');
const {wait, remove, ignoreError} = require('./utils');
const {timeoutPromise} = require('./promise_utils');
const {importFile} = require('./loader');
const output = require('./output');

const mkdirp = promisify(mkdirpCb);

let tmp_home;

/**
 * Launch a new browser with puppeteer, with a new page (=Tab). The browser is completely isolated from any other calls.
 * Most interactions will be with the page, but you can get the browser using `await page.browser();`.
 * For more information about the page object, see the [puppeteer API documentation](https://github.com/puppeteer/puppeteer/blob/master/docs/api.md).
 *
 * @example
 * ```javascript
 * const page = await newPage(config);
 * await page.goto('https://example.org/');
 * await waitForText(page, 'More information');
 * await closePage(page);
 * ```
 * @param {import('./internal').TaskConfig} config The pentf configuration object.
 * @param {string[]} [chrome_args] Additional arguments for Chrome (optional).
 * @returns {import('puppeteer').Page} The puppeteer page handle.
 */
async function newPage(config, chrome_args = []) {
    addBreadcrumb(config, 'enter newPage()');
    /** @type {import('puppeteer')} */
    let puppeteer;
    try {
        if (config.puppeteer_firefox) {
            puppeteer = await importFile('puppeteer-firefox', config.moduleType);
        } else {
            puppeteer = await importFile('puppeteer', config.moduleType);
        }
    } catch (e) {
        // puppeteer/puppeteer-firefox is a peer dependency. Show a helpful error message when it's missing.
        if (config.puppeteer_firefox) {
            console.error('Please install "puppeteer-firefox" package with \'npm i puppeteer\'.');
        } else {
            console.error('Please install "puppeteer" package with \'npm i puppeteer\'.');
        }
    }

    const args = ['--no-sandbox'];
    args.push(...chrome_args);

    const params = {
        args,
        ignoreHTTPSErrors: config.env === 'local',
    };
    if (!config.headless) {
        params.headless = false;

        // Browser extensions only work in non-headless mode
        if (config.extensions && config.extensions.length) {
            const extensions = config.extensions.join(',');

            args.push(
                // Without this flag the supplied extensions are not
                // initialized correctly and need to be refreshed in
                // the browser's extension ui.
                `--disable-extensions-except=${extensions}`,
                `--load-extension=${extensions}`
            );
        }
    }
    if (config.slow_mo) {
        params.slowMo = config.slow_mo;
    }
    if (config.devtools) {
        params.devtools = true;
    }

    // Redirect home directory to prevent puppeteer from accessing smart cards on Linux
    if (process.platform === 'linux') {
        if (!tmp_home) {
            // Races here are fine; we just want to limit the number of temporary directories
            const future_tmp_home = (await tmp.dir({prefix: 'itest-chromium'})).path;

            // Set up .pki, to allow local certificate shenenigans (like mkcert)
            const mkdir = promisify(fs.mkdir);
            await mkdir(path.join(future_tmp_home, '.pki'));
            await mkdir(path.join(future_tmp_home, '.pki', 'nssdb'));
            const copyNssFile = async basename => {
                const source_file = path.join(process.env.HOME, '.pki', 'nssdb', basename);
                const exists = await new Promise(resolve =>
                    fs.access(source_file, fs.constants.F_OK, err => resolve(!err))
                );

                if (!exists) return;
                await promisify(fs.copyFile)(
                    source_file,
                    path.join(future_tmp_home, '.pki', 'nssdb', basename)
                );
            };
            await copyNssFile('cert9.db');
            tmp_home = future_tmp_home;
        }
        params.env = {
            ...process.env,
            HOME: tmp_home,
        };
    }

    // Resize browser to actual viewport width
    if (!config.headless) {
        params.defaultViewport = null;
    }

    /** @type {import('puppeteer').Browser} */
    const browser = await puppeteer.launch({
        ...params,
        // Workaround until official support for Apple's M1 chip lands in puppeteer:
        // Puppeteer for some reason ignores the environment variable on arm64 systems
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    });
    const page = (await browser.pages())[0];

    if (config.devtools_preserve) {
        const configureDevtools = async target => {
            if (!/^(?:chrome-)?devtools:\/\//.test(await target.url())) {
                return;
            }

            // new devtools created, configure it
            const session = await target.createCDPSession();
            await assertAsyncEventually(
                async () => {
                    return (
                        await session.send('Runtime.evaluate', {
                            expression: `(() => {
                        try {
                            Common.moduleSetting("network_log.preserve-log").set(true);
                            Common.moduleSetting("preserveConsoleLog").set(true);
                        } catch { // devtools not yet loaded
                            return false;
                        }

                        return Common.moduleSetting("preserveConsoleLog").get() === true;
                        })()
                    `,
                        })
                    ).result.value;
                },
                {
                    message: 'could not toggle preserve options in devtools',
                    timeout: 10000,
                    checkEvery: 100,
                }
            );
            await session.detach();
        };

        browser.on('targetcreated', configureDevtools);
        const targets = await browser.targets();
        await Promise.all(targets.map(t => configureDevtools(t)));
    }

    // Make sure that the browser window matches the viewport size
    if (!config.headless) {
        // Default puppeteer viewport size
        await resizePage(config, page, {width: 800, height: 600});
    }

    browser._logs = [];
    if (config.forward_console) {
        await forwardBrowserConsole(config, page);
    }

    if (config._browser_pages) {
        config._browser_pages.push(page);

        page.on('popup', async popup => {
            config._browser_pages.push(popup);
            popup.on('domcontentloaded', async () => {
                await installInteractions(popup);
            });

            popup.on('framenavigated', async frame => {
                await installInteractions(frame);
            });
        });
    }

    withBreadcrumb(config, page, '$', selector => `page.$(${selector})`);
    withBreadcrumb(config, page, '$$', selector => `page.$$(${selector})`);
    withBreadcrumb(config, page, '$eval', () => 'page.$eval()');
    withBreadcrumb(config, page, '$$eval', () => 'page.$$eval()');
    withBreadcrumb(config, page, 'click', selector => `page.click(${selector})`);
    withBreadcrumb(config, page, 'evaluate', () => 'page.evaluate()');
    withBreadcrumb(config, page, 'goto', url => `page.goto(${url})`);
    withBreadcrumb(config, page, 'type', (selector, text) => `page.type(${selector}, ${text})`);
    withBreadcrumb(
        config,
        page,
        'waitForSelector',
        selector => `page.waitForSelector(${selector})`
    );
    withBreadcrumb(config, page, 'waitForFunction', () => 'page.waitForFunction()');
    withBreadcrumb(config, page, 'waitForXPath', xpath => `page.waitForXPath(${xpath})`);

    // The Browser instance is the nearest shared ancestor across pages
    // and frames.
    browser._pentf_config = config;
    addBreadcrumb(config, 'exit newPage()');

    // PDF renderer invokes newPage with a raw config object which doesn't
    // have runner sepcific properties
    if (config._teardown_hooks) {
        // Don't use onTeardown, because importing it would lead to a circular
        // dependency.
        config._teardown_hooks.push(async () => {
            if (!page.isClosed()) {
                await closePage(page);
            }
        });
    }

    if (config.show_interactions) {
        withInteractions(page, 'setContent');
        withInteractions(page, 'newPage');

        page.on('domcontentloaded', async () => {
            await installInteractions(page);
        });

        // Necessary for embedded iframes
        page.on('framenavigated', async frame => {
            await installInteractions(frame);
        });

        browser.on('targetcreated', async target => {
            if (target.url() === 'about:blank' || /^https?:\/\//.test(target.url())) {
                const tab = await target.page();
                withInteractions(tab, 'setContent');
                withInteractions(tab, 'newPage');
                await installInteractions(tab);
            }
        });

        browser.on('targetchanged', async target => {
            const tab = await target.page();

            // This should not happen according to the types, but
            // sometimes we get no page object.
            if (tab === null) return;

            await installInteractions(tab);
        });
    }

    return page;
}

/**
 * Resizes the browser window so that the page matches the specified dimensions.
 * @param {import('./config').Config} config
 * @param {import('puppeteer').Page} page
 * @param {{ width: number, height: number }} dimensions
 */
async function resizePage(config, page, {width, height}) {
    if (config.headless) {
        // If we're running headless there is no point in trying to keep
        // the browser resizeable. Just use the existing `page.setViewport()`
        // API instead.
        await page.setViewport({width, height});
    } else {
        const actual = await page.evaluate(() => {
            return {width: window.innerWidth, height: window.innerHeight};
        });

        const browser = getBrowser(page);

        if (actual.width !== width || actual.height !== height) {
            // Get browser tab and resize window via devtools protocol
            const targetId = page._target._targetInfo.targetId;
            const {windowId} = await browser._connection.send('Browser.getWindowForTarget', {
                targetId,
            });
            const {bounds} = await browser._connection.send('Browser.getWindowBounds', {windowId});

            // Resize to correct dimensions
            await browser._connection.send('Browser.setWindowBounds', {
                bounds: {
                    width: bounds.width + width - actual.width,
                    height: bounds.height + height - actual.height,
                },
                windowId,
            });
        }
    }
}

/**
 * Add a callback to execute during the teardown phase of the test case.
 * @param {import('./internal').TaskConfig} config
 * @param {import('./internal').TeardownHook} callback
 */
function onTeardown(config, callback) {
    config._teardown_hooks.push(callback);
}

/**
 * Create a unique temporary user data directory. Will be automatically
 * deleted when the test completes
 * @param {import('./internal').TaskConfig} config
 * @returns {Promise<string>} Path to temporary user data dir
 */
async function createUserProfileDir(config) {
    // Ensure that we can create multiple user dirs in the same test
    const hash = Math.random().toString(36).substring(7);
    const dir = (await tmp.dir({prefix: `pentf-profile-${config._taskName}-${hash}`})).path;

    onTeardown(config, async () => {
        await promisify(rimraf)(dir);
    });

    return dir;
}

/** @type {(x: any) => x is import('puppeteer').Page} */
const isPage = x => x !== null && typeof x === 'object' && typeof x.isClosed === 'function';

/** @type {(pageOrFrame: import('puppeteer').Page | import('puppeteer').Frame) => import('puppeteer').Page} */
const getPage = pageOrFrame =>
    isPage(pageOrFrame) ? pageOrFrame : pageOrFrame._frameManager._page;

/**
 * Get the text content of an error or warning page inserted by the browser.
 * The most common one is a page for an HTTPS-Error or lack of HTTPS.
 * @param {import('puppeteer').Page | import('puppeteer').Frame} pageOrFrame
 * @param {Error} error
 * @param {Promise<Error>}
 */
async function enhanceError(config, pageOrFrame, error) {
    const page = getPage(pageOrFrame);
    if (!page.isClosed()) {
        // Check if the page is injected by the browser like for an insecure
        // form submission in Chrome.
        const content = await page.evaluate(() => {
            const s = '.interstitial-wrapper #main-content #main-message';
            const node = document.querySelector(s);

            if (node === null) {
                return null;
            }

            return {
                heading: document.querySelector('h1').textContent,
                text: Array.from(document.querySelectorAll('p'))
                    .map(d => d.textContent.trim())
                    .filter(Boolean)
                    .join('\n\n'),
            };
        });

        if (content) {
            const heading = output.color(config, 'bold', content.heading);
            const message = output.color(config, 'red', `${heading}\n${content.text}`);
            error.message += `\n\nThis error message was displayed by the browser:\n\n${message}`;
        }
    }

    return error;
}

/**
 * @param {import('puppeteer').Page} page
 * @param {K extends keyof import('puppeteer').Page} prop
 */
function withInteractions(page, prop) {
    const original = page[prop];
    page[prop] = async (...args) => {
        const res = await original.apply(page, args);
        await installInteractions(page);
        return res;
    };
}

/**
 * Inject a box into the page that shows last user interaction like where the
 * last click occured on the page.
 * @param {import('puppeteer').Page | import('puppeteer').Frame} page
 */
async function installInteractions(page) {
    const config = getBrowser(page)._pentf_config;
    try {
        // Skip injecting into html when trusted page is enabled to prevent
        // noisy console output, that confused users.
        const isTrustedPage = await page.evaluate(() => {
            return (
                document.head &&
                document.head.querySelector('meta[content*="trusted-types"   ]') !== null
            );
        });
        if (isTrustedPage) {
            output.logVerbose(
                config,
                'Cannot install pentf interaction ui overlays into page with trusted types. Skipping...'
            );
            return;
        }

        await page.evaluate(() => {
            /**
             * @param {MouseEvent} e
             */
            function handleEvent(e) {
                let x = e.pageX;
                let y = e.pageY;

                // Account for offset of the current frame if we are inside an iframe
                let win = window;
                let parentWin = null;
                while (win !== window.top) {
                    parentWin = win.parent;

                    const iframe = Array.from(parentWin.document.querySelectorAll('iframe')).find(
                        f => f.contentWindow === win
                    );
                    if (iframe) {
                        const iframeRect = iframe.getBoundingClientRect();
                        x += iframeRect.x;
                        y += iframeRect.y;
                        break;
                    }
                }

                // At this point we're dealing with an embedded iframe. Move
                // the parent cursor's pointer to the correct position
                let el = window.top.document.querySelector('#pentf-mouse-pointer');
                if (el === null) {
                    el = window.top.document.createElement('div');
                    el.id = 'pentf-mouse-pointer';
                    el.innerHTML = `<svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="-4 -4 54 54"
                    >
                        <path
                            d="M1 0v46.3l8.5-9 5 9.8L26.8 41l-5.2-10h12.7z"
                            fill="#E149E6"
                            stroke-width="5"
                            stroke="#fff"
                        />
                    </svg>`;
                    el.style.cssText = `
                        pointer-events: none;
                        position: absolute;
                        top: 0;
                        z-index: 10000000;
                        left: 0;
                        width: 24px;
                        height: 24px;
                        margin: -2px 0 -2px 0;
                        padding: 0;
                    `;

                    window.top.document.body.appendChild(el);
                }

                el.style.left = x + 'px';
                el.style.top = y + 'px';
            }

            document.addEventListener('mousedown', handleEvent, true);
            document.addEventListener('click', handleEvent, true);
            document.addEventListener('mouseup', handleEvent, true);
        });
    } catch (err) {
        if (!ignoreError(err)) {
            throw err;
        }
    }
}

/**
 * Get browser instance from a Page or Frame instance
 * @param {import('puppeteer').Page | import('puppeteer').Frame} pageOrFrame
 * @private
 */
function getBrowser(pageOrFrame) {
    if (typeof pageOrFrame.browser === 'function') {
        return pageOrFrame.browser();
    } else {
        return pageOrFrame._frameManager._page.browser();
    }
}

/**
 * Get the default timeout from a Page or Frame instance
 * @param {import('puppeteer').Page | import('puppeteer').Frame} pageOrFrame
 * @private
 */
function getDefaultTimeout(pageOrFrame) {
    return getBrowser(pageOrFrame)._pentf_config.default_timeout;
}

/**
 * Mark progress in test. Useful for when the test times out and there is no
 * hint as to why.
 * @param {import('./internal').TaskConfig} config
 * @param {string} name
 * @private
 */
function addBreadcrumb(config, name) {
    const time = Math.round(performance.now() - config.start);
    config._breadcrumb = new Error(`Last breadcrumb "${name}" at ${time}ms after test started.`);
}

/**
 * @template {K}
 * @param {import('puppeteer').Page} page
 * @param {K extends keyof import('puppeteer').Page} prop
 * @param {(...any[]) => string} getName
 */
function withBreadcrumb(config, page, prop, getName) {
    const original = page[prop];
    page[prop] = (...args) => {
        const name = getName.apply(null, args);
        addBreadcrumb(config, `enter ${name}`);
        const res = original.apply(page, args);
        addBreadcrumb(config, `exit ${name}`);
        return res;
    };
}

/**
 * Close a page (and its associated browser)
 * @param {import('puppeteer').Page} page puppeteer page object returned by `newPage`.
 */
async function closePage(page) {
    const browser = getBrowser(page);
    /** @type {import('./config').Config} */
    const config = browser._pentf_config;
    addBreadcrumb(config, 'enter closePage()');

    // Wait for all pending logging tasks to finish before closing browser
    await timeoutPromise(config, Promise.all(browser._logs), {
        message: 'Aborting waiting on page logs',
    });

    if (config._browser_pages) {
        remove(config._browser_pages, p => p === page);
    }

    const closeFn = async () => {
        try {
            // Only close page if it's not already closed. Sometimes this happens when
            // puppeteer has an internal error.
            if (!page.isClosed()) {
                await page.close();
            }
        } catch (err) {
            // Sometimes `page.isClosed()` is not up to date. Therefore
            // we ignore typical connection closed erros.
            if (!ignoreError(err)) {
                throw await enhanceError(config, page, err);
            }
        }
    };
    await timeoutPromise(config, closeFn(), {message: 'Closing the page took too long'});
    await timeoutPromise(config, browser.close(), {message: 'Closing the browser took too long'});
    addBreadcrumb(config, 'exit closePage()');
}

/**
 * Wait for an element matched by a CSS query selector to become present on the page.
 *
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string} selector Query selector, e.g. `div > a[href="/"]:visited`
 * @param {{timeout?: number, message?: string, visible?: boolean}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} [message] Error message shown if the element is not visible in time.
 * @param {number?} [timeout] How long to wait, in milliseconds.
 * @param {visible?} [visible] Whether the element must be visible within the timeout. (default: `true`)
 * @returns {Promise<import('puppeteer').ElementHandle>} A handle to the found element.
 */
async function waitForSelector(
    page,
    selector,
    {message = undefined, timeout = getDefaultTimeout(page), visible = true} = {}
) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter waitForSelector(${selector})`);

    let el;
    try {
        el = await page.waitForFunction(
            (qs, visible) => {
                const all = document.querySelectorAll(qs);
                if (all.length < 1) return null;
                const el = all[0];
                if (visible && (el.offsetParent === null || el.style.visibility === 'hidden')) {
                    return null;
                }
                return el;
            },
            {timeout},
            selector,
            visible
        );
    } catch (e) {
        const foundCount = await page.evaluate(
            qs => document.querySelectorAll(qs).length,
            selector
        );
        if (foundCount > 0) {
            const moreCount = foundCount - 1;
            const suffix =
                foundCount > 1
                    ? `. There are ${moreCount} more elements matching the same selector on the page. Maybe the selector needs to be more specific?`
                    : '';
            const err = new Error(
                `Element matching  ${selector}  did not become visible within ${output.formatTime(
                    timeout
                )}${suffix}` + (message ? `. ${message}` : '')
            );
            throw await enhanceError(config, page, err);
        } else {
            const err = new Error(
                `Failed to find element matching  ${selector}  within ${output.formatTime(
                    timeout
                )}` + (message ? `. ${message}` : '')
            );
            throw await enhanceError(config, page, err);
        }
    }
    assert(el !== null);
    addBreadcrumb(config, `exit waitForSelector(${selector})`);
    return el;
}

/**
 * Wait until a selector is gone from the page
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string} selector [CSS selector](https://www.w3.org/TR/2018/REC-selectors-3-20181106/#selectors) (aka query selector) of the targeted element.
 * @param {{timeout?: number, message?: string, checkEvery?: number}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} message Error message shown if the element is not visible in time.
 * @param {number?} timeout How long to wait, in milliseconds.
 * @param {number?} checkEvery Intervals between checks, in milliseconds.
 */
async function waitForSelectorGone(
    page,
    selector,
    {timeout = getDefaultTimeout(page), message, checkEvery = 200} = {}
) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter waitForSelectorGone(${selector})`);

    let remainingTimeout = timeout;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        let found = false;
        let errored = false;
        try {
            found = await page.evaluate(selector => {
                return !!document.querySelector(selector);
            }, selector);
        } catch (err) {
            errored = true;
            if (!ignoreError(err)) {
                throw await enhanceError(config, page, err);
            }
        }

        if (!errored && !found) {
            break;
        }

        if (remainingTimeout <= 0) {
            assert(
                !found,
                'Element matching ' +
                    selector +
                    ' is present, but should not be there.' +
                    (message ? ' ' + message : '')
            );
            break;
        }

        await wait(Math.min(checkEvery, remainingTimeout));
        remainingTimeout -= checkEvery;
    }
    addBreadcrumb(config, `exit waitForSelectorGone(${selector})`);
}

/**
 * Wait for an element matched by a CSS query selector to become visible.
 * Visible means the element has neither `display:none` nor `visibility:hidden`.
 * Elements outside the current viewport (e.g. you'd need to scroll) and hidden with CSS trickery
 * (opacity, overlaid with z-index, or permanently positioned outside the viewport) count as visible.
 *
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string} selector Query selector, e.g. `div > a[href="/"]:visited`
 * @param {{timeout?: number, message?: string}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} [message] Error message shown if the element is not visible in time.
 * @param {number?} [timeout] How long to wait, in milliseconds.
 * @returns {Promise<import('puppeteer').ElementHandle>} A handle to the found element.
 */
async function waitForVisible(page, selector, {timeout, message} = {}) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter waitForVisible(${selector})`);
    const el = await waitForSelector(page, selector, {timeout, message, visible: true});
    addBreadcrumb(config, `exit waitForVisible(${selector})`);
    return el;
}

/**
 * Construct an XPath expression for an arbitrary string.
 *
 * @example
 * ```javascript
 * const searchString = `'"'`;
 * const page = await newPage(config);
 * await page.goto('https://github.com/boxine/pentf/blob/master/browser_utils.js');
 * await page.waitForXPath(`//div[@class="repository-content"]//text()[contains(., ${escapeXPathText(searchString)})]`);
 * await closePage();
 * ```
 * @param {string} text The text to encode. This can be user input or otherwise contain exotic characters.
 */
function escapeXPathText(text) {
    if (!text.includes('"')) {
        // No doubles quotes ("), simple case
        return `"${text}"`;
    }
    return (
        'concat(' +
        text
            .split('"')
            .map(part => `"${part}"`)
            .join(", '\"', ") +
        ')'
    );
}

/**
 * @hidden
 */
function checkText(text) {
    if (typeof text !== 'string') {
        let repr;
        try {
            repr = JSON.stringify(text);
        } catch (e) {
            repr = '' + text;
        }
        throw new Error(`Invalid text argument: ${repr}`);
    }
    if (!text) {
        throw new Error(`Missing text argument: ${JSON.stringify(text)}`);
    }
}

/**
 * Wait for text to appear on the page.
 *
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string} text String to look for.
 * @param {{timeout?: number, extraMessage?: string}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} extraMessage Error message shown if the element is not present in time.
 * @param {number?} timeout How long to wait, in milliseconds.
 * @returns {Promise<import('puppeteer').ElementHandle>} A handle to the text node.
 */
async function waitForText(
    page,
    text,
    {timeout = getDefaultTimeout(page), extraMessage = undefined} = {}
) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter waitForText(${text})`);
    checkText(text);
    const extraMessageRepr = extraMessage ? ` (${extraMessage})` : '';
    const err = new Error(
        `Unable to find text ${JSON.stringify(text)} after ${output.formatTime(
            timeout
        )}${extraMessageRepr}`
    );

    const xpath = `//text()[contains(., ${escapeXPathText(text)})]`;
    try {
        const res = await page.waitForXPath(xpath, {timeout});
        addBreadcrumb(config, `exit waitForText(${text})`);
        return res;
    } catch (e) {
        throw await enhanceError(config, page, err);
    }
}

/**
 * @hidden
 */
function _checkTestId(testId) {
    if (typeof testId !== 'string') throw new Error(`Invalid testId type ${testId}`);
    assert(/^[-a-zA-Z0-9_.]+$/.test(testId), `Invalid testId ${JSON.stringify(testId)}`);
}

/**
 * Search for an element with the given `data-testid` attribute.
 *
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string} testId The test id to search
 * @param {{extraMessage?: string, timeout?: number, visible?: boolean}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} extraMessage Error message shown if the element is not visible in time.
 * @param {number?} timeout How long to wait, in milliseconds.
 * @param {boolean?} visible Whether the element must be visible within the timeout. (default: `true`)
 * @returns {Promise<import('puppeteer').ElementHandle>} Handle to the element with the given test ID.
 */
async function waitForTestId(
    page,
    testId,
    {extraMessage = undefined, timeout = getDefaultTimeout(page), visible = true} = {}
) {
    _checkTestId(testId);
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter waitForTestId(${testId})`);

    const err = new Error(
        `Failed to find ${
            visible ? 'visible ' : ''
        }element with data-testid "${testId}" within ${output.formatTime(timeout)}` +
            (extraMessage ? `. ${extraMessage}` : '')
    );

    const qs = `*[data-testid="${testId}"]`;
    let el;
    try {
        el = await page.waitForFunction(
            (qs, visible) => {
                const all = document.querySelectorAll(qs);
                if (all.length < 1) return null;
                const [el] = all;
                if (visible && el.offsetParent === null) return null;
                return el;
            },
            {timeout},
            qs,
            visible
        );
    } catch (e) {
        throw await enhanceError(config, page, err); // Do not construct error here lest stack trace gets lost
    }
    assert(el !== null);
    addBreadcrumb(config, `exit waitForTestId(${testId})`);
    return el;
}

/**
 * Wait until a test-id is gone from the page
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string} testid the testid to check for
 * @param {{timeout?: number, message?: string, checkEvery?: number}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} message Error message shown if the element is not visible in time.
 * @param {number?} timeout How long to wait, in milliseconds.
 * @param {number?} checkEvery Intervals between checks, in milliseconds.
 */
async function waitForTestIdGone(
    page,
    testid,
    {timeout = getDefaultTimeout(page), message, checkEvery = 200} = {}
) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter waitForTestIdGone(${testid})`);

    await waitForSelectorGone(page, `[data-testid="${testid}"]`, {
        timeout,
        message,
        checkEvery,
    });

    addBreadcrumb(config, `exit waitForTestIdGone(${testid})`);
}

/**
 * Assert an `<input>` element having a certain value (after a wait if necessary).
 *
 * @param {import('puppeteer').ElementHandle} input A puppeteer handle to an input element.
 * @param {string} expected The value that is expected to be present.
 */
async function assertValue(input, expected) {
    const page = input._page;
    assert(page);
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter assertValue(${expected})`);
    try {
        await page.waitForFunction(
            (inp, expected) => {
                return inp.value === expected;
            },
            {timeout: 2000},
            input,
            expected
        );
        addBreadcrumb(config, `exit assertValue(${expected})`);
    } catch (e) {
        if (e.name !== 'TimeoutError') throw e;

        const {value, name, id} = await page.evaluate(inp => {
            return {
                value: inp.value,
                name: inp.name,
                id: inp.id,
            };
        }, input);

        if (value === expected) return; // Successful just at the last second

        const input_str =
            'input' +
            (name ? `[name=${JSON.stringify(name)}]` : '') +
            (id ? `[id=${JSON.stringify(id)}]` : '');

        throw new Error(
            `Expected ${input_str} value to be ${JSON.stringify(expected)}, but is ${JSON.stringify(
                value
            )}`
        );
    }
}

/**
 * Assert that there is currently no element matching the XPath on the page.
 *
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string} xpath XPath to search for.
 * @param {{timeout?: number, message?: string, checkEvery?: number}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} message Error message shown if the element is not visible in time.
 * @param {number?} timeout How long to wait, in milliseconds. (Default: 2s)
 * @param {number?} checkEvery Intervals between checks, in milliseconds.
 */
async function waitForXPathGone(
    page,
    xpath,
    {timeout = getDefaultTimeout(page), message, checkEvery = 200} = {}
) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter waitForXPathGone(${xpath})`);

    assert.equal(
        typeof xpath,
        'string',
        `XPath ${xpath} should be a string, but is of type ${typeof xpath}`
    );

    let remainingTimeout = timeout;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        let found = false;
        let errored = false;
        try {
            found = await page.evaluate(xpath => {
                const element = document
                    .evaluate(xpath, document, null, window.XPathResult.ANY_TYPE, null)
                    .iterateNext();
                return !!element;
            }, xpath);
        } catch (err) {
            errored = true;
            if (!ignoreError(err)) {
                throw await enhanceError(config, page, err);
            }
        }

        if (!errored && !found) {
            break;
        }

        if (remainingTimeout <= 0) {
            assert(
                !found,
                'Element matching ' +
                    xpath +
                    ' is present, but should not be there.' +
                    (message ? ' ' + message : '')
            );
            break;
        }

        await wait(Math.min(checkEvery, remainingTimeout));
        remainingTimeout -= checkEvery;
    }
    addBreadcrumb(config, `exit waitForXPathGone(${xpath})`);
}

/**
 * Assert that there is currently no element matching the XPath on the page.
 *
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string} xpath XPath to search for.
 * @param {{timeout?: number, message?: string, checkEvery?: number}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} message Error message shown if the element is not visible in time.
 * @param {number?} timeout How long to wait, in milliseconds. (Default: 2s)
 * @param {number?} checkEvery Intervals between checks, in milliseconds.
 */
async function assertNotXPath(page, xpath, options, _timeout = 2000, _checkEvery = 200) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter assertNotXPath(${xpath})`);
    assert.equal(
        typeof xpath,
        'string',
        `XPath ${xpath} should be a string, but is of type ${typeof xpath}`
    );

    // Legacy way of calling this function; will be deprecated and later removed
    if (typeof options === 'string') {
        options = {message: options};
        options.timeout = _timeout;
        options.checkEvery = _checkEvery;
    } else {
        if (!options) options = {};
        if (!options.timeout) options.timeout = 2000;
        if (!options.checkEvery) options.checkEvery = 200;
    }
    const {message, timeout, checkEvery} = options;

    let remainingTimeout = timeout;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        let found = false;
        try {
            found = await page.evaluate(xpath => {
                const element = document
                    .evaluate(xpath, document, null, window.XPathResult.ANY_TYPE, null)
                    .iterateNext();
                return !!element;
            }, xpath);
        } catch (err) {
            if (!ignoreError(err)) {
                throw await enhanceError(config, page, err);
            }
        }
        assert(
            !found,
            'Element matching ' +
                xpath +
                ' is present, but should not be there.' +
                (message ? ' ' + message : '')
        );

        if (remainingTimeout <= 0) {
            break;
        }

        await wait(Math.min(checkEvery, remainingTimeout));
        remainingTimeout -= checkEvery;
    }
    addBreadcrumb(config, `exit assertNotXPath(${xpath})`);
}

/**
 * Optionally run post-assertion check
 * @param {() => Promise<boolean | void>} fn
 * @returns {Promise<boolean>}
 */
async function onSuccess(fn) {
    if (!fn) return true;

    try {
        const res = await fn();
        // Allow assertions (returns void) inside handler
        if (res === undefined) {
            return true;
        }
        if (!res) {
            throw new Error('retryUntil/assertSuccess returned a falsy value');
        }
    } catch (err) {
        // The page may have navigated and therefore the execution
        // context may have been destroyed. Ignore those errors.
        if (ignoreError(err)) {
            return false;
        }

        throw err;
    }

    return true;
}

/**
 * Puppeteer's frame object doesn't expose the mouse itself
 * @param {import('puppeteer').Page | import('puppeteer').Frame} pageOrFrame
 */
function getMouse(pageOrFrame) {
    return pageOrFrame.mouse || pageOrFrame._frameManager._page.mouse;
}

/**
 * Clicks an element address    ed by a query selector atomically, e.g. within the same event loop run as finding it.
 *
 * @example
 * ```javascript
 * await clickSelector(page, 'div[data-id="foo"] a.view', {message: 'Could not click foo link'});
 * ```
 * @param {import('puppeteer').Page | import('puppeteer').Frame} page puppeteer page object.
 * @param {string} selector [CSS selector](https://www.w3.org/TR/2018/REC-selectors-3-20181106/#selectors) (aka query selector) of the targeted element.
 * @param {{timeout?: number, checkEvery?: number, message?: string, visible?: boolean, assertSuccess?: () => Promise<boolean>, retryUntil?: () => Promise<boolean | void>}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} message Error message shown if the element is not visible in time.
 * @param {number?} timeout How long to wait, in milliseconds.
 * @param {number?} checkEvery How long to wait _between_ checks, in ms. (default: 200ms)
 * @param {boolean?} visible Whether the element must be visible within the timeout. (default: `true`)
 * @param {() => Promise<boolean | void>?} assertSuccess Deprecated: Alias of retryUntil
 * @param {() => Promise<boolean | void>?} retryUntil Additional check or assertion to verify that the operation was successful. This is needed in cases where a DOM node is present
 * and we clicked on it, but the framework that rendered the node didn't set up any event listeners yet.
 */
async function clickSelector(
    page,
    selector,
    {
        timeout = getDefaultTimeout(page),
        checkEvery = 200,
        message = undefined,
        visible = true,
        assertSuccess,
        retryUntil,
    } = {}
) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter clickSelector(${selector})`);
    assert.equal(
        typeof selector,
        'string',
        'CSS selector should be string (forgot page argument?)'
    );

    let remainingTimeout = timeout;
    let retryUntilError = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        let found = false;
        try {
            found = await page.evaluate(
                async (selector, visible) => {
                    const element = document.querySelector(selector);
                    if (!element) return false;

                    if (visible) {
                        if (element.offsetParent === null) return null; // invisible

                        // Element may be hidden in a scroll container
                        element.scrollIntoView({
                            block: 'center',
                            inline: 'center',
                            behavior: 'instant',
                        });
                        const visibleRatio = await new Promise(resolve => {
                            const observer = new IntersectionObserver(entries => {
                                resolve(entries[0].intersectionRatio);
                                observer.disconnect();
                            });
                            observer.observe(element);
                        });
                        if (visibleRatio !== 1.0) {
                            element.scrollIntoView({
                                block: 'center',
                                inline: 'center',
                                behavior: 'instant',
                            });
                        }

                        const rect = /** @type {Element} */ (element).getBoundingClientRect();
                        let x = rect.x + rect.width / 2;
                        let y = rect.y + rect.height / 2;

                        // Account for offset of the current frame if we are inside an iframe
                        let win = window;
                        let parentWin = null;
                        while (win !== window.top) {
                            parentWin = win.parent;

                            const iframe = Array.from(
                                parentWin.document.querySelectorAll('iframe')
                            ).find(f => f.contentWindow === win);
                            if (iframe) {
                                const iframeRect = iframe.getBoundingClientRect();
                                x += iframeRect.x;
                                y += iframeRect.y;
                                break;
                            }
                        }
                        return {x, y};
                    }

                    // We can't use the mouse to click on invisible elements.
                    // Therefore invoke the click handler on the DOM node directly.
                    element.click();
                    return true;
                },
                selector,
                visible
            );

            // Simulate a true mouse click. The following function scrolls
            // the element into view, moves the mouse to its center and
            // presses the left mouse button. This is important for when
            // an element is above the one we want to click.
            if (found !== null && typeof found === 'object') {
                await getMouse(page).click(found.x, found.y);
            }
        } catch (err) {
            if (!ignoreError(err)) {
                throw await enhanceError(config, page, err);
            }
        }

        try {
            if (
                (found || (!found && retryUntilError !== null)) &&
                (await onSuccess(retryUntil || assertSuccess))
            ) {
                const config = getBrowser(page)._pentf_config;
                addBreadcrumb(config, `exit clickSelector(${selector})`);
                return;
            }
        } catch (err) {
            retryUntilError = err;
        }

        if (remainingTimeout <= 0) {
            if (retryUntilError) {
                throw retryUntilError;
            }

            if (!message) {
                message = `Unable to find ${
                    visible ? 'visible ' : ''
                }element ${selector} after ${output.formatTime(timeout)}`;
            }
            throw await enhanceError(config, page, new Error(message));
        }
        await wait(Math.min(remainingTimeout, checkEvery));
        remainingTimeout -= checkEvery;
    }
}

/**
 * Asserts that a selector is not present in the passed page or frame.
 *
 * @example
 * ```javascript
 * await assertNotSelector(page, 'div[data-id="foo"] a.view', {message: 'Expected foo to not be present'});
 * ```
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string} selector [CSS selector](https://www.w3.org/TR/2018/REC-selectors-3-20181106/#selectors) (aka query selector) of the targeted element.
 * @param {{timeout?: number, message?: string}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} message Error message shown if the element is not visible in time.
 * @param {number?} timeout How long to wait, in milliseconds.
 */
async function assertNotSelector(
    page,
    selector,
    {timeout = getDefaultTimeout(page), message} = {}
) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter assertNotSelector(${selector})`);
    try {
        await page.waitForSelector(selector, {timeout});
    } catch (err) {
        addBreadcrumb(config, `exit assertNotSelector(${selector})`);
        return;
    }

    throw new Error(
        `Element matching ${selector} is present, but should not be there. ${
            message ? ' ' + message : ''
        }`
    );
}

/**
 * Clicks an element addressed by XPath atomically, e.g. within the same event loop run as finding it.
 *
 * ```javascript
 * await clickXPath(
 *     page, '//article[.//h1//text()[contains(., "My form")]]/button',
 *     {message: 'Could not find the button in the foobar form'}
 * );
 * ```
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string} xpath XPath selector to match the element.
 * @param {{timeout?: number, checkEvery?: number, message?: string, visible?: boolean, assertSuccess?: () => Promise<boolean>, retryUntil?: () => Promise<boolean>}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} message Error message shown if the element is not visible in time.
 * @param {number?} timeout How long to wait, in milliseconds.
 * @param {number?} checkEvery How long to wait _between_ checks, in ms. (default: 200ms)
 * @param {boolean?} visible Whether the element must be visible within the timeout. (default: `true`)
 * @param {() => Promise<boolean | void>?} assertSuccess Deprecated: Alias of retryUntil
 * @param {() => Promise<boolean | void>?} retryUntil Additional check or assertion to verify that the operation was successful. This is needed in cases where a DOM node is present
 * and we clicked on it, but the framework that rendered the node didn't set up any event listeners yet.
 */
async function clickXPath(
    page,
    xpath,
    {
        timeout = getDefaultTimeout(page),
        checkEvery = 200,
        message = undefined,
        visible = true,
        assertSuccess,
        retryUntil,
    } = {}
) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter clickXPath(${xpath})`);
    assert.equal(typeof xpath, 'string', 'XPath should be string (forgot page argument?)');

    let remainingTimeout = timeout;
    let retryUntilError = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        let found = false;
        try {
            found = await page.evaluate(
                async (xpath, visible) => {
                    /** @type {Element | Text} */
                    const element = document
                        .evaluate(xpath, document, null, window.XPathResult.ANY_TYPE, null)
                        .iterateNext();
                    if (!element) return false;

                    if (visible) {
                        if (element.offsetParent === null) return null; // invisible

                        /**
                         * Get the center coordinates of our element to click on.
                         * @type {DOMRect}
                         */
                        let rect;

                        // Text nodes don't have `getBoundingClientRect()`, but
                        // we can use range objects for that.
                        if (element.nodeType === Node.TEXT_NODE) {
                            // Element may be hidden in a scroll container
                            element.parentNode.scrollIntoView({
                                block: 'center',
                                inline: 'center',
                                behavior: 'instant',
                            });

                            const visibleRatio = await new Promise(resolve => {
                                const observer = new IntersectionObserver(entries => {
                                    resolve(entries[0].intersectionRatio);
                                    observer.disconnect();
                                });
                                observer.observe(element.parentNode);
                            });
                            if (visibleRatio !== 1.0) {
                                element.scrollIntoView({
                                    block: 'center',
                                    inline: 'center',
                                    behavior: 'instant',
                                });
                            }

                            const range = document.createRange();
                            range.selectNodeContents(element);

                            const rects = range.getClientRects();
                            if (!rects || rects.length < 1) {
                                throw new Error(
                                    `Could not determine Text node coordinates of "${element.data}"`
                                );
                            }

                            rect = rects[0];
                        } else {
                            // Element may be hidden in a scroll container
                            element.scrollIntoView({
                                block: 'center',
                                inline: 'center',
                                behavior: 'instant',
                            });
                            const visibleRatio = await new Promise(resolve => {
                                const observer = new IntersectionObserver(entries => {
                                    resolve(entries[0].intersectionRatio);
                                    observer.disconnect();
                                });
                                observer.observe(element);
                            });
                            if (visibleRatio !== 1.0) {
                                element.scrollIntoView({
                                    block: 'center',
                                    inline: 'center',
                                    behavior: 'instant',
                                });
                            }

                            rect = /** @type {Element} */ (element).getBoundingClientRect();
                        }

                        let x = rect.x + rect.width / 2;
                        let y = rect.y + rect.height / 2;

                        // Account for offset of the current frame if we are inside an iframe
                        let win = window;
                        let parentWin = null;
                        while (win !== window.top) {
                            parentWin = win.parent;

                            const iframe = Array.from(
                                parentWin.document.querySelectorAll('iframe')
                            ).find(f => f.contentWindow === win);
                            if (iframe) {
                                const iframeRect = iframe.getBoundingClientRect();
                                x += iframeRect.x;
                                y += iframeRect.y;
                                break;
                            }
                        }
                        return {x, y};
                    }

                    // Click on invisible elements
                    element.click();
                    return true;
                },
                xpath,
                visible
            );

            // Simulate a true mouse click. The following function scrolls
            // the element into view, moves the mouse to its center and
            // presses the left mouse button. This is important for when
            // an element is above the one we want to click.
            if (found !== null && typeof found === 'object') {
                await getMouse(page).click(found.x, found.y);
            }
        } catch (err) {
            if (!ignoreError(err)) {
                throw await enhanceError(config, page, err);
            }
        }

        try {
            if (
                (found || (!found && retryUntilError !== null)) &&
                (await onSuccess(retryUntil || assertSuccess))
            ) {
                addBreadcrumb(config, `exit clickXPath(${xpath})`);
                return;
            }
        } catch (err) {
            retryUntilError = err;
        }

        if (remainingTimeout <= 0) {
            if (retryUntilError) {
                throw retryUntilError;
            }

            if (!message) {
                message = `Unable to find XPath ${xpath} after ${output.formatTime(timeout)}`;
            }
            throw await enhanceError(config, page, new Error(message));
        }
        await wait(Math.min(remainingTimeout, checkEvery));
        remainingTimeout -= checkEvery;
    }
}

/**
 * Click any element by its text content.
 *
 * The text can span multiple nodes.
 *
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string | RegExp} textOrRegExp Text or regex to match the text that the element must contain.
 * @param {{extraMessage?: string, timeout?: number, checkEvery?: number, visible?: boolean, assertSuccess?: () => Promise<boolean>, retryUntil?: () => Promise<boolean>}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {number?} timeout How long to wait, in milliseconds.
 * @param {number?} checkEvery Intervals between checks, in milliseconds. (default: 200ms)
 * @param {string?} extraMessage Optional error message shown if the element is not visible in time.
 * @param {boolean?} visible Optional check if element is visible (default: true)
 * @param {() => Promise<boolean | void>?} assertSuccess Deprecated: Alias of retryUntil
 * @param {() => Promise<boolean | void>?} retryUntil Additional check or assertion to verify that the operation was successful. This is needed in cases where a DOM node is present
 * and we clicked on it, but the framework that rendered the node didn't set up any event listeners yet.
 */
async function clickText(
    page,
    textOrRegExp,
    {
        timeout = getDefaultTimeout(page),
        checkEvery = 200,
        extraMessage = undefined,
        visible = true,
        assertSuccess,
        retryUntil,
    } = {}
) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter clickText(${textOrRegExp})`);
    if (typeof textOrRegExp === 'string') {
        checkText(textOrRegExp);
    }

    const serializedMatcher =
        typeof textOrRegExp !== 'string'
            ? {source: textOrRegExp.source, flags: textOrRegExp.flags}
            : textOrRegExp;

    let remainingTimeout = timeout;
    let retryUntilError = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        let found = false;

        try {
            found = await page.evaluate(
                async (matcher, visible) => {
                    // eslint-disable-next-line no-undef
                    /** @type {(text: string) => boolean} */
                    let matchFunc;
                    /** @type {null | (text: string) => boolean} */
                    let matchFuncExact = null;

                    if (typeof matcher == 'string') {
                        matchFunc = text => text.includes(matcher);
                    } else {
                        const regexExact = new RegExp(matcher.source, matcher.flags);
                        matchFuncExact = text => {
                            // Reset regex state in case global flag was used
                            regexExact.lastIndex = 0;
                            return regexExact.test(text);
                        };

                        // Remove leading ^ and ending $, otherwise the traversal
                        // will fail at the first node.
                        const source = matcher.source.replace(/^[^]/, '').replace(/[$]$/, '');
                        const regex = new RegExp(source, matcher.flags);
                        matchFunc = text => {
                            // Reset regex state in case global flag was used
                            regex.lastIndex = 0;
                            return regex.test(text);
                        };
                    }

                    const stack = [document.body];
                    let item = null;
                    let lastFound = null;
                    while ((item = stack.pop())) {
                        for (let i = 0; i < item.childNodes.length; i++) {
                            const child = item.childNodes[i];

                            // Skip text nodes as they are not clickable
                            if (child.nodeType === Node.TEXT_NODE) {
                                continue;
                            }

                            const text = child.textContent || '';
                            if (child.childNodes.length > 0 && matchFunc(text)) {
                                if (matchFuncExact === null || matchFuncExact(text)) {
                                    lastFound = child;
                                }
                                stack.push(child);
                            }
                        }
                    }

                    if (!lastFound) return false;

                    if (visible) {
                        if (lastFound.offsetParent === null) return null; // invisible)

                        // Element may be hidden in a scroll container
                        lastFound.scrollIntoView({
                            block: 'center',
                            inline: 'center',
                            behavior: 'instant',
                        });
                        const visibleRatio = await new Promise(resolve => {
                            const observer = new IntersectionObserver(entries => {
                                resolve(entries[0].intersectionRatio);
                                observer.disconnect();
                            });
                            observer.observe(lastFound);
                        });
                        if (visibleRatio !== 1.0) {
                            lastFound.scrollIntoView({
                                block: 'center',
                                inline: 'center',
                                behavior: 'instant',
                            });
                        }

                        const rect = lastFound.getBoundingClientRect();
                        let x = rect.x + rect.width / 2;
                        let y = rect.y + rect.height / 2;

                        // Account for offset of the current frame if we are inside an iframe
                        let win = window;
                        let parentWin = null;
                        while (win !== window.top) {
                            parentWin = win.parent;

                            const iframe = Array.from(
                                parentWin.document.querySelectorAll('iframe')
                            ).find(f => f.contentWindow === win);
                            if (iframe) {
                                const iframeRect = iframe.getBoundingClientRect();
                                x += iframeRect.x;
                                y += iframeRect.y;
                                break;
                            }
                        }
                        return {x, y};
                    }

                    lastFound.click();
                    return true;
                },
                serializedMatcher,
                visible
            );

            // Simulate a true mouse click. The following function scrolls
            // the element into view, moves the mouse to its center and
            // presses the left mouse button. This is important for when
            // an element is above the one we want to click.
            if (found !== null && typeof found === 'object') {
                await getMouse(page).click(found.x, found.y);
            }
        } catch (err) {
            if (!ignoreError(err)) {
                throw await enhanceError(config, page, err);
            }
        }

        try {
            if (
                (found || (!found && retryUntilError !== null)) &&
                (await onSuccess(retryUntil || assertSuccess))
            ) {
                addBreadcrumb(config, `exit clickText(${textOrRegExp})`);
                return;
            }
        } catch (err) {
            retryUntilError = err;
        }

        if (remainingTimeout <= 0) {
            if (retryUntilError) {
                throw retryUntilError;
            }

            const extraMessageRepr = extraMessage ? ` (${extraMessage})` : '';
            throw await enhanceError(
                config,
                page,
                new Error(
                    `Unable to find${
                        visible ? ' visible' : ''
                    } text "${textOrRegExp}" after ${output.formatTime(timeout)}${extraMessageRepr}`
                )
            );
        }
        await wait(Math.min(remainingTimeout, checkEvery));
        remainingTimeout -= checkEvery;
    }
}

/**
 * Click an element identified by a test ID (`data-testid=` attribute).
 * Selecting and clicking happens in the same tick, so this is safe to call even if the client application may currently be rerendering.
 *
 * @param {import('puppeteer').Page} page The puppeteer page handle.
 * @param {string} testId The test ID to look for.
 * @param {{extraMessage?: string, timeout?: number, visible?: boolean, assertSuccess?: () => Promise<boolean>, retryUntil?: () => Promise<boolean>}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} extraMessage Optional error message shown if the element is not present in time.
 * @param {number?} timeout How long to wait, in milliseconds. (default: true)
 * @param {() => Promise<boolean | void>?} assertSuccess Deprecated: Alias of retryUntil
 * @param {() => Promise<boolean | void>?} retryUntil Additional check or assertion to verify that the operation was successful. This is needed in cases where a DOM node is present
 * and we clicked on it, but the framework that rendered the node didn't set up any event listeners yet.
 */
async function clickTestId(
    page,
    testId,
    {
        extraMessage = undefined,
        timeout = getDefaultTimeout(page),
        visible = true,
        assertSuccess,
        retryUntil,
    } = {}
) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter clickTestId(${testId})`);
    _checkTestId(testId);

    const xpath = `//*[@data-testid="${testId}"]`;
    const extraMessageRepr = extraMessage ? `. ${extraMessage}` : '';
    const message = `Failed to find${
        visible ? ' visible' : ''
    } element with data-testid "${testId}" within ${output.formatTime(timeout)}${extraMessageRepr}`;
    const res = await clickXPath(page, xpath, {
        timeout,
        message,
        visible,
        retryUntil: retryUntil || assertSuccess,
    });
    addBreadcrumb(config, `exit clickTestId(${testId})`);
    return res;
}

/**
 * Asserts that an element identified by a test ID (`data-testid=` attribute) is not present in the passed page or frame.
 *
 * @example
 * ```javascript
 * await assertNotTestId(page, 'foo', {message: 'Expected Test ID "foo" to not be present'});
 * ```
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string} testId The test ID to look for.
 * @param {{timeout?: number, message?: string}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} message Error message shown if the element is not visible in time.
 * @param {number?} timeout How long to wait, in milliseconds.
 */
async function assertNotTestId(page, testId, {timeout = getDefaultTimeout(page), message} = {}) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter assertNotTestId(${testId})`);
    _checkTestId(testId);

    const xpath = `//*[@data-testid="${testId}"]`;
    try {
        await assertNotXPath(page, xpath, {timeout});
        addBreadcrumb(config, `exit assertNotTestId(${testId})`);
    } catch (err) {
        if (/Element\smatching/.test(err.message)) {
            throw new Error(
                `Element matching test id "${testId}" is present, but should not be there. ${
                    message ? ' ' + message : ''
                }`
            );
        }
    }
}
/**
 * Type text into an element identified by a query selector.
 *
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string} selector selector [CSS selector](https://www.w3.org/TR/2018/REC-selectors-3-20181106/#selectors) (aka query selector) of the element to type in.
 * @param {string} text Text to type
 * @param {{message?: string, timeout?: number, delay?:bumber}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {number?} timeout How long to wait, in milliseconds.
 * @param {string?} message Message shown if the element can not be found.
 * @param {number?} delay Delay in ms between each keystroke (Default: 0)
 */
async function typeSelector(
    page,
    selector,
    text,
    {message = undefined, timeout = getDefaultTimeout(page), delay} = {}
) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter typeSelector(${selector}, text: ${text})`);
    const el = await waitForVisible(page, selector, {timeout, message});
    await el.type(text, {delay});
    addBreadcrumb(config, `exit typeSelector(${selector}, text: ${text})`);
}

/**
 * Configure the browser's language.
 *
 * @param {import('puppeteer').Page} page The puppeteer page handle.
 * @param {string | string[]} lang Either be a single string (e.g. "en") or an array of supported languages (e.g. `['de-DE', 'en-US', 'gr']`)
 */
async function setLanguage(page, lang) {
    if (typeof lang === 'string') {
        lang = [lang];
    }
    assert(Array.isArray(lang));
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter setLanguage(${lang.join(', ')})`);

    // From https://stackoverflow.com/a/47292022/35070
    await page.setExtraHTTPHeaders({'Accept-Language': lang.join(',')}); // For HTTP requests
    await page.evaluateOnNewDocument(lang => {
        // For JavaScript code
        Object.defineProperty(navigator, 'language', {
            // Allow future setLanguage() calls to overwrite this property
            configurable: true,
            get: function () {
                return lang[0];
            },
        });
        Object.defineProperty(navigator, 'languages', {
            // Allow future setLanguage() calls to overwrite this property
            configurable: true,
            get: function () {
                return lang;
            },
        });
    }, lang);
    addBreadcrumb(config, `exit setLanguage(${lang.join(', ')})`);
}

/**
 * Retrieve attribute value of a DOM element.
 *
 * @param {import('puppeteer').Page} page The puppeteer page handle.
 * @param {string} selector Query selector for the element.
 * @param {string} name Attribute name.
 * @returns {Promise<string>} The attribute value
 */
async function getAttribute(page, selector, name) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter getAttribute(${selector}, attr: ${name})`);
    await page.waitForSelector(selector);
    const res = await page.$eval(
        selector,
        (el, propName) => {
            if (propName in el) {
                const value = el[propName];
                return propName === 'style' ? value.cssText : value;
            }
            return el.getAttribute(propName);
        },
        name
    );
    addBreadcrumb(config, `exit getAttribute(${selector}, attr: ${name})`);
    return res;
}

/**
 * Get the text content of a given DOM Element.
 *
 * @returns {import('puppeteer').Page} The puppeteer page handle.
 * @param {string} selector Query selector.
 * @returns {Promise<string>} Text content of the selected element.
 */
async function getText(page, selector) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter getText(${selector})`);
    const res = await getAttribute(page, selector, 'textContent');
    addBreadcrumb(config, `exit getText(${selector})`);
    return res;
}

/**
 * Get all options of a `<select>` as an array of strings. The selected option is suffixed with `(***)`.
 *
 * @param {import('puppeteer').Page} page  The puppeteer page handle.
 * @param {import('puppeteer').ElementHandle<HTMLSelectElement>} select puppeteer handl eto the `<select>`.
 * @returns {Promise<string[]>} e.g. `['Option A', 'Option B(***)', 'Option C']`
 */
async function getSelectOptions(page, select) {
    return await page.evaluate(select => {
        return Array.from(select.options).map(option => {
            return option.innerText + (option.selected ? '(***)' : '');
        });
    }, select);
}

/**
 *
 * @param {import('./config').Config} config
 * @param {import('puppeteer').Page} page
 * @param {string} fileName
 * @param {string} [selector]
 */
async function takeScreenshot(config, page, fileName, selector) {
    await mkdirp(config.screenshot_directory);
    const file = path.join(config.screenshot_directory, fileName);
    return await _takeScreenshot(page, {file, selector, fullPage: true});
}

/**
 * @param {import('puppeteer').Page} page
 * @param {{ file?: string, selector?: string, fullPage?: boolean, hideInteraction?: boolean }} [options]
 */
async function _takeScreenshot(page, {file, selector, fullPage, hideInteraction} = {}) {
    const viewport = page.viewport();

    if (hideInteraction) {
        await page.evaluate(() => {
            const el = document.querySelector('#pentf-mouse-pointer');
            if (el) {
                el.style.display = 'none';
            }
        });
    }

    let img;
    if (selector) {
        const el = await page.waitForSelector(selector);
        img = await el.screenshot({
            path: file,
            type: 'png',
        });
    } else {
        img = await page.screenshot({
            path: file,
            type: 'png',
            fullPage,
        });
    }

    if (hideInteraction) {
        await page.evaluate(() => {
            const el = document.querySelector('#pentf-mouse-pointer');
            if (el) {
                el.style.display = 'block';
            }
        });
    }

    // Restore emulation, fixes unable to resize window after taking a screenshot.
    await page._client.send('Emulation.clearDeviceMetricsOverride');

    // Restore potential emulation settings that were active before
    // we took the screenshot.
    if (viewport !== null) {
        await page.setViewport(viewport);
    }

    return img;
}

/**
 *
 * @param {import('./config').Config}
 * @param {import('puppeteer').Frame | import('puppeteer').Page} page
 */
async function assertAccessibility(config, page) {
    assert(config, 'Missing config argument');
    assert(page, 'Missing page argument');

    output.logVerbose(config, '[a11y] Checking for accessibility errors...');

    const url = page.url();

    await page.addScriptTag({
        path: require.resolve('axe-core'),
    });

    /** @type {import('axe-core').AxeResults} */
    const results = await page.evaluate(() => {
        return new Promise((resolve, reject) => {
            window.axe.run(document, {ancestry: true}, (err, results) => {
                if (err !== null) reject(err);
                else resolve(results);
            });
        });
    });

    const errors = config.accessibilityErrors;

    let i = errors.length;
    for (const v of results.violations) {
        /** @type {import('./internal').A11yNode[]} */
        const nodes = [];

        for (const node of v.nodes) {
            let imgs = [];
            if (node.ancestry) {
                // We can't postpone taking screenshots as the html may change later
                for (const selector of node.ancestry) {
                    const name = `${config._taskName}-a11y-${i++}`;

                    try {
                        const img = await takeScreenshot(config, page, name, selector);
                        imgs.push(img);
                    } catch (err) {
                        output.logVerbose(
                            config,
                            '[runner] Could not take screenshot ' + err.message
                        );
                        return null;
                    }
                }
            }

            nodes.push({
                html: node.html,
                selectors: node.ancestry || [],
                screenshots: imgs,
            });
        }

        errors.push({
            impact: v.impact || 'minor',
            helpUrl: v.helpUrl,
            description: v.help,
            nodes,
        });
    }

    output.logVerbose(config, '[a11y] Checking for accessibility errors... Done');

    if (errors.length > 0) {
        const err = new Error(`There were ${errors.length} accessibility violations on ${url}`);
        err.accessibilityErrors = errors;
        throw err;
    }
}

/**
 * Take a screenshot and compare it against an existing one. Any differences between
 * the two will be highlighted.
 * @param {import('./internal').TaskConfig} config
 * @param {import('puppeteer').Page} page
 * @param {string} name
 * @param {{ threshold?: number, selector?: string, fullPage?: boolean } & import('pixelmatch').PixelmatchOptions} [options]
 */
async function assertSnapshot(
    config,
    page,
    name,
    {threshold = 0.2, selector, fullPage = true, ...pxl} = {}
) {
    await mkdirp(config.snapshot_directory);
    const target = path.join(config.snapshot_directory, `${config._taskName}_${name}-expected.png`);

    /** @type {import('pngjs').PNGWithMetadata | null} */
    let expected = null;
    /** @type {Buffer | null} */
    let expectedBuf = null;
    try {
        expectedBuf = await fs.promises.readFile(target);
        expected = PNG.sync.read(expectedBuf);
    } catch (e) {
        if (!e.message.includes('ENOENT')) {
            throw e;
        }
    }

    // We have never seen this snapshot before, take a new one
    // or we want to update existing snapshots
    if (expected === null || config.update_snapshots) {
        await _takeScreenshot(page, {file: target, selector, fullPage, hideInteraction: true});
    } else {
        let actualBuf = await _takeScreenshot(page, {selector, fullPage, hideInteraction: true});
        let actual = PNG.sync.read(actualBuf);

        let width = expected.width;
        let height = expected.height;
        // To do an actual visual comparison we need to ensure that both images
        // have the same dimension. We'll resize to the longest edge of either image
        if (actual.width !== width || actual.height !== height) {
            const expectedSize = `${width}x${height}px`;
            const actualSize = `${actual.width}x${actual.height}px`;
            output.logVerbose(
                config,
                `[snapshot] Image dimensions don't match. Expected ${expectedSize}, but got ${actualSize} for ${name}. Resizing...`
            );

            width = Math.max(expected.width, actual.width);
            height = Math.max(expected.height, actual.height);

            // Extend actual image if needed
            if (actual.width !== width || actual.height !== height) {
                output.logVerbose(
                    config,
                    `[snapshot] Resizing actual from ${actual.width}x${actual.height} -> ${width}x${height}`
                );
                actualBuf = await sharp(actualBuf)
                    .extend({
                        top: 0,
                        left: 0,
                        bottom: height - actual.height,
                        right: width - actual.width,
                        background: {r: 0, g: 0, b: 0, alpha: 0},
                    })
                    .toBuffer();
                actual = PNG.sync.read(actualBuf);
            }

            // Extend expected image if needed
            if (expected.width !== width || expected.height !== height) {
                output.logVerbose(
                    config,
                    `[snapshot] Resizing expected from ${expected.width}x${expected.height} -> ${width}x${height}`
                );
                expectedBuf = await sharp(expectedBuf)
                    .extend({
                        top: 0,
                        left: 0,
                        bottom: height - expected.height,
                        right: width - expected.width,
                        background: {r: 0, g: 0, b: 0, alpha: 0},
                    })
                    .toBuffer();
                expected = PNG.sync.read(expectedBuf);
            }
        }

        const diff = new PNG({width: expected.width, height: expected.height});
        const differenceCount = pixelmatch(
            expected.data,
            actual.data,
            diff.data,
            expected.width,
            expected.height,
            {threshold, diffColor: [255, 70, 230], ...pxl}
        );

        if (differenceCount > 0) {
            // Write image with highlighted differences to disk
            const buf = PNG.sync.write(diff);
            const diffFile = path.join(
                config.screenshot_directory,
                `${config._taskName}_${name}-diff.png`
            );
            await fs.promises.writeFile(diffFile, buf);

            // Attach diff image to task so that it shows up in PDFs
            config._snapshots.push(buf);

            // Write actual image to disk too (for visual reference)
            const actualFile = path.join(
                config.screenshot_directory,
                `${config._taskName}_${name}-actual.png`
            );
            await fs.promises.writeFile(actualFile, actualBuf);
            // Write expected image to disk too (for visual reference)
            const expectedFile = path.join(
                config.screenshot_directory,
                `${config._taskName}_${name}-expected.png`
            );
            await fs.promises.writeFile(expectedFile, expectedBuf);

            throw new Error(
                `Snapshot failed, there were ${differenceCount} differences, see ${diffFile}`
            );
        }
    }
}

/**
 * Speed up all timeouts of calls to `setTimeout`/`setInterval`.
 *
 * @example
 * ```javascript
 * const page = await newPage(config);
 * await page.setContent('<div>Hello world</div>');
 * await speedupTimeouts(page, {factor: 1000});
 * await page.evaluate(() => {
 *     window.setTimeout(() => console.log("will log almost immediately"), 2000);
 * });
 * await restoreTimeouts(page);
 * await page.evaluate(() => {
 *     window.setTimeout(() => console.log("will log after 2 seconds"), 2000);
 * });
 * await closePage(page);
 * ```
 * @param {import('puppeteer').Page} page The puppeteer page handle.
 * @param {{factor?: number, persistent?: boolean}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param number? factor Speedup factor (e.g. a timeout of 20 seconds with a speedup of 100 will fire after 200ms). (default: 100)
 * @param boolean? persistent Whether this change should persist in case of page navigation. Set this if the next line is `await page.goto(..)` or similar. (default: false)
 */
async function speedupTimeouts(page, {factor = 100, persistent = false} = {}) {
    function applyTimeouts(factor) {
        window._pentf_real_setTimeout = window._pentf_real_setTimeout || window.setTimeout;
        window.setTimeout = (func, delay, ...args) => {
            return window._pentf_real_setTimeout(func, delay && delay / factor, ...args);
        };

        window._pentf_real_setInterval = window._pentf_real_setInterval || window.setInterval;
        window.setInterval = (func, delay, ...args) => {
            return window._pentf_real_setInterval(func, delay && delay / factor, ...args);
        };
    }

    if (persistent) {
        await page.evaluateOnNewDocument(applyTimeouts, factor);
    } else {
        await page.evaluate(applyTimeouts, factor);
    }
}

/**
 * Restore timeouts modified by [[speedupTimeouts]]
 *
 * @param {import('puppeteer').Page} page The puppeteer page handle.
 */
async function restoreTimeouts(page) {
    await page.evaluate(() => {
        if (window._pentf_real_setTimeout) {
            window.setTimeout = window._pentf_real_setTimeout;
        }
        if (window._pentf_real_setInterval) {
            window.setInterval = window._pentf_real_setInterval;
        }
    });
}

/**
 * @hidden
 */
async function workaround_setContent(page, html) {
    // Workaround for https://github.com/GoogleChrome/puppeteer/issues/4464
    const waiter = page.waitForNavigation({waitUntil: 'load'});
    await page.evaluate(html => {
        document.open();
        document.write(html);
        document.close();
    }, html);
    await waiter;
}

/**
 * Intercept browser requests
 * @param {import('puppeteer').Page} page
 * @param {(request: import('puppeteer').Request) => Promise<void> | void} fn
 */
async function interceptRequest(page, fn) {
    if (!page._pentf_intercept_handlers) {
        await page.setRequestInterception(true);

        page._pentf_intercept_handlers = [];
        page.on('request', async request => {
            for (const handler of page._pentf_intercept_handlers) {
                await handler(request);

                if (request._interceptionHandled) {
                    break;
                }
            }

            // Don't stall requests
            if (!request._interceptionHandled) {
                request.continue();
            }
        });
    }

    page._pentf_intercept_handlers.push(fn);
}

// Render HTML code as a PDF file.
// modifyPage can be an async function to change the page in the browser.

/**
 * Render a HTML string as a PDF file.
 *
 * @param {*} config The pentf configuration object.
 * @param {string} path PDF file name to write to.
 * @param {string} html Full HTML document to render.
 * @param {*} modifyPage An optional async function to modify the `page` object.
 */
async function html2pdf(config, path, html, modifyPage = null) {
    const pdfConfig = {...config};
    pdfConfig.headless = true;
    // The headless option will be overwritten if devtools=true, leading to a
    // crash when attempting to generate a pdf snapshot. See:
    // https://github.com/puppeteer/puppeteer/blob/v2.1.1/docs/api.md#puppeteerdefaultargsoptions
    pdfConfig.devtools = false;
    const page = await newPage(pdfConfig);

    await workaround_setContent(page, html);
    if (modifyPage) {
        await modifyPage(page);
    }
    await page.pdf({
        path,
        printBackground: true,
        preferCSSPageSize: true,
    });
    await closePage(page);
}

module.exports = {
    assertAccessibility,
    assertNotSelector,
    assertNotTestId,
    assertNotXPath,
    assertSnapshot,
    assertValue,
    clickNestedText: clickText,
    clickSelector,
    clickTestId,
    clickText,
    clickXPath,
    closePage,
    createUserProfileDir,
    escapeXPathText,
    getAttribute,
    getSelectOptions,
    getText,
    html2pdf,
    interceptRequest,
    newPage,
    onTeardown,
    resizePage,
    restoreTimeouts,
    setLanguage,
    speedupTimeouts,
    takeScreenshot,
    typeSelector,
    waitForSelector,
    waitForSelectorGone,
    waitForTestId,
    waitForTestIdGone,
    waitForText,
    waitForVisible,
    waitForXPathGone,
    workaround_setContent,
};
