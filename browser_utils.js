'use strict';
/**
 * Browser functions, based upon puppeteer.
 * These functions extend [the puppeteer API](https://github.com/puppeteer/puppeteer/blob/master/docs/api.md).
 * @packageDocumentation
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {promisify} = require('util');
const tmp = require('tmp-promise');

const {assertAsyncEventually, wait, remove} = require('./utils');

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
 * @param {*} config The pentf configuration object.
 * @param {string[]} [chrome_args] Additional arguments for Chrome (optional).
 * @returns {import('puppeteer').Page} The puppeteer page handle.
 */
async function newPage(config, chrome_args=[]) {
    let puppeteer;
    try {
        if(config.puppeteer_firefox) {
            puppeteer = require('puppeteer-firefox');
        } else {
            puppeteer = require('puppeteer');
        }
    } catch(e) {
        // puppeteer/puppeteer-firefox is a peer dependency. Show a helpful error message when it's missing.
        if(config.puppeteer_firefox) {
            console.error('Please install "puppeteer-firefox" package with \'npm i puppeteer\'.');
        } else {
            console.error('Please install "puppeteer" package with \'npm i puppeteer\'.');
        }
    }

    const args = ['--no-sandbox'];
    args.push(...chrome_args);

    const params = {
        args,
        ignoreHTTPSErrors: (config.env === 'local'),
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
                    source_file, path.join(future_tmp_home, '.pki', 'nssdb', basename));
            };
            await copyNssFile('cert9.db');
            tmp_home = future_tmp_home;
        }
        params.env = {
            ...process.env,
            HOME: tmp_home,
        };
    }
    const browser = await puppeteer.launch(params);
    const page = (await browser.pages())[0];

    if (config.devtools_preserve) {
        const configureDevtools = async (target) => {
            if (! /^(?:chrome-)?devtools:\/\//.test(await target.url())) {
                return;
            }

            // new devtools created, configure it
            const session = await target.createCDPSession();
            await assertAsyncEventually(async() => {
                return (await session.send('Runtime.evaluate', {
                    expression: `(() => {
                        try {
                            Common.moduleSetting("network_log.preserve-log").set(true);
                            Common.moduleSetting("preserveConsoleLog").set(true);
                        } catch { // devtools not yet loaded
                            return false;
                        }

                        return Common.moduleSetting("preserveConsoleLog").get() === true;
                        })()
                    `
                })).result.value;
            }, {
                message: 'could not toggle preserve options in devtools',
                timeout: 10000,
                checkEvery: 100,
            });
            await session.detach();
        };

        browser.on('targetcreated', configureDevtools);
        const targets = await browser.targets();
        await Promise.all(targets.map(t => configureDevtools(t)));
    }

    if (config._browser_pages) {
        page._pentf_browser_pages = config._browser_pages;
        config._browser_pages.push(page);
    }

    return page;
}

/**
 * Close a page (and its associated browser)
 * @param {import('puppeteer').Page} page puppeteer page object returned by `newPage`.
 */
async function closePage(page) {
    if (page._pentf_browser_pages) {
        remove(page._pentf_browser_pages, p => p === page);
    }

    const browser = await page.browser();
    await page.close();
    await browser.close();
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
async function waitForVisible(page, selector, {message=undefined, timeout=30000}={}) {
    // Precompute errors for nice stack trace
    const notFoundErr = new Error(
        `Failed to find element matching  ${selector}  within ${timeout}ms` +
        (message ? `. ${message}` : ''));
    const visibleErr = new Error(
        `Element matching  ${selector}  did not become visible within ${timeout}ms` +
        (message ? `. ${message}` : ''));

    let el;
    try {
        el = await page.waitForFunction(qs => {
            const all = document.querySelectorAll(qs);
            if (all.length !== 1) return null;
            const el = all[0];
            if (el.offsetParent === null) return null;
            if (el.style.visibility === 'hidden') return null;
            return el;
        }, {timeout}, selector);
    } catch(e) {
        const found = await page.evaluate(
            qs => document.querySelectorAll(qs).length === 1, selector);
        if (found) {
            throw visibleErr;
        } else {
            throw notFoundErr;
        }
    }
    assert(el !== null);
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
    return 'concat(' + text.split('"').map(part => `"${part}"`).join(', \'"\', ') + ')';
}

/**
 * @hidden
 */
function checkText(text) {
    if (typeof text !== 'string') {
        let repr;
        try {
            repr = JSON.stringify(text);
        } catch(e) {
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
async function waitForText(page, text, {timeout=30000, extraMessage=undefined}={}) {
    checkText(text);
    const extraMessageRepr = extraMessage ? ` (${extraMessage})` : '';
    const err = new Error(`Unable to find text ${JSON.stringify(text)} after ${timeout}ms${extraMessageRepr}`);

    const xpath = `//text()[contains(., ${escapeXPathText(text)})]`;
    try {
        return await page.waitForXPath(xpath, {timeout});
    } catch (e) {
        throw err;
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
async function waitForTestId(page, testId, {extraMessage=undefined, timeout=30000, visible=true} = {}) {
    _checkTestId(testId);

    const err = new Error(
        `Failed to find ${visible ? 'visible ' : ''}element with data-testid "${testId}" within ${timeout}ms` +
        (extraMessage ? `. ${extraMessage}` : ''));

    const qs = `*[data-testid="${testId}"]`;
    let el;
    try {
        el = await page.waitForFunction((qs, visible) => {
            const all = document.querySelectorAll(qs);
            if (all.length !== 1) return null;
            const [el] = all;
            if (visible && (el.offsetParent === null)) return null;
            return el;
        }, {timeout}, qs, visible);
    } catch (e) {
        throw err; // Do not construct error here lest stack trace gets lost
    }
    assert(el !== null);
    return el;
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
    try {
        await page.waitForFunction((inp, expected) => {
            return inp.value === expected;
        }, {timeout: 2000}, input, expected);
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

        const input_str = (
            'input' +
            (name ? `[name=${JSON.stringify(name)}]` : '') +
            (id ? `[id=${JSON.stringify(id)}]` : '')
        );

        throw new Error(
            `Expected ${input_str} value to be ${JSON.stringify(expected)}, but is ${JSON.stringify(value)}`);
    }
}

/**
 * Assert that there is currently no element matching the XPath on the page.
 *
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string} xpath XPath to search for.
 * @param {string?} message Error message shown if the element is not visible in time.
 * @param {number?} waitMs How long to wait, in milliseconds. (Default: 2s)
 * @param {number?} checkEvery Intervals between checks, in milliseconds.
 */
async function assertNotXPath(page, xpath, message='', waitMs=2000, checkEvery=200) {
    while (true) { // eslint-disable-line no-constant-condition
        const found = await page.evaluate(xpath => {
            const element = document.evaluate(
                xpath, document, null, window.XPathResult.ANY_TYPE, null).iterateNext();
            return !!element;
        }, xpath);
        assert(!found,
            'Element matching ' + xpath + ' is present, but should not be there.' +
            (message ? ' ' + message : ''));

        if (waitMs <= 0) {
            break;
        }

        await wait(Math.min(checkEvery, waitMs));
        waitMs -= checkEvery;
    }
}

/**
 * Clicks an element atomically, e.g. within the same event loop run as finding it
 *
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string} xpath XPath selector to match the element.
 * @param {{timeout?: number, checkEvery?: number, message?: string, visible?: boolean}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} message Error message shown if the element is not visible in time.
 * @param {number?} timeout How long to wait, in milliseconds.
 * @param {number?} checkEvery How long to wait _between_ checks, in ms. (default: 200ms)
 * @param {boolean?} visible Whether the element must be visible within the timeout. (default: `true`)
 */
async function clickXPath(page, xpath, {timeout=30000, checkEvery=200, message=undefined, visible=true} = {}) {
    assert.equal(typeof xpath, 'string', 'XPath should be string (forgot page argument?)');

    let remainingTimeout = timeout;
    while (true) { // eslint-disable-line no-constant-condition
        const found = await page.evaluate((xpath, visible) => {
            const element = document.evaluate(
                xpath, document, null, window.XPathResult.ANY_TYPE, null).iterateNext();
            if (!element) return false;

            if (visible && element.offsetParent === null) return null; // invisible

            element.click();
            return true;
        }, xpath, visible);

        if (found) {
            return;
        }

        if (remainingTimeout <= 0) {
            if (!message) {
                message = `Unable to find XPath ${xpath} after ${timeout}ms`;
            }
            throw new Error(message);
        }
        await wait(Math.min(remainingTimeout, checkEvery));
        remainingTimeout -= checkEvery;
    }
}

const DEFAULT_CLICKABLE_ELEMENTS = ['a', 'button', 'input', 'label'];
const DEFAULT_CLICKABLE = (
    '//*[' + DEFAULT_CLICKABLE_ELEMENTS.map(e => `local-name()="${e}"`).join(' or ') + ']');

/**
 * Click a link, button, label, or input by its text content.
 *
 * @param {import('puppeteer').Page} page  puppeteer page object.
 * @param {string} text Text that the element must contain.
 * @param {{timeout?: number, checkEvery?: number, elementXPath?: string, extraMessage?: string}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} extraMessage Optional error message shown if the element is not visible in time.
 * @param {number?} timeout How long to wait, in milliseconds.
 * @param {number?} checkEvery Intervals between checks, in milliseconds. (default: 200ms)
 * @param {string} elementXPath XPath selector for the elements to match. By default matching `a`, `button`, `input`, `label`. `'//*'` to match any element.
 */
async function clickText(page, text, {timeout=30000, checkEvery=200, elementXPath=DEFAULT_CLICKABLE, extraMessage=undefined}={}) {
    checkText(text);
    const xpath = (
        elementXPath +
        `[contains(text(), ${escapeXPathText(text)})]`);
    const extraMessageRepr = extraMessage ? ` (${extraMessage})` : '';
    return clickXPath(page, xpath, {
        timeout,
        checkEvery,
        message: `Unable to find text ${JSON.stringify(text)} after ${timeout}ms${extraMessageRepr}`,
    });
}

/**
 * Click any element by its text content.
 * 
 * The text can span multiple nodes compared to `clickText` which matches direct descended text nodes only.
 * 
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string | RegExp} textOrRegExp Text or regex to match the text that the element must contain.
 * @param {{extraMessage?: string, timeout?: number, checkEvery?: number, visible?: boolean}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {number?} timeout How long to wait, in milliseconds.
 * @param {number?} checkEvery Intervals between checks, in milliseconds. (default: 200ms)
 * @param {string?} extraMessage Optional error message shown if the element is not visible in time.
 * @param {boolean?} visibale Optional check if element is visible (default: true)
 */
async function clickNestedText(page, textOrRegExp, {timeout=30000, checkEvery=200, extraMessage=undefined, visible=true}={}) {
    if (typeof textOrRegExp === 'string') {
        checkText(textOrRegExp);
    }

    const serializedMatcher = typeof textOrRegExp !== 'string' 
        ? {source: textOrRegExp.source, flags: textOrRegExp.flags}
        : textOrRegExp;

    let remainingTimeout = timeout;
    while (true) { // eslint-disable-line no-constant-condition
        const found = await page.evaluate((matcher, visible) => {
            // eslint-disable-next-line no-undef
            /** @type {(text: string) => boolean} */
            let matchFunc;
            if (typeof matcher == 'string') {
                matchFunc = text => text.includes(matcher);
            } else {
                const regex = new RegExp(matcher.source, matcher.flags);
                matchFunc = text => {
                    // Reset regex state in case global flag was used
                    regex.lastIndex = 0;
                    return regex.test(text);
                };
            }

            let item = document.body;
            let lastFound = null;
            while (true) { // eslint-disable-line no-constant-condition
                for (let i = 0; i < item.childNodes.length; i++) {
                    const child = item.childNodes[i];
                    
                    // Skip text nodes as they are not clickable
                    if (child.nodeType === Node.TEXT_NODE) {
                        continue;
                    }

                    if (matchFunc(child.textContent)) {
                        item = child;
                        break;
                    }
                }

                if (lastFound === item) {
                    break;
                }

                lastFound = item;
            }

            if (!lastFound) return false;

            if (visible && lastFound.offsetParent === null) return null; // invisible)

            lastFound.click();
            return true;
        }, serializedMatcher, visible);

        if (found) {
            return;
        }

        if (remainingTimeout <= 0) {
            const extraMessageRepr = extraMessage ? ` (${extraMessage})` : '';
            throw new Error(`Unable to find${visible ? ' visible' : ''} text "${textOrRegExp}" after ${timeout}ms${extraMessageRepr}`);
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
 * @param {{extraMessage?: string, timeout?: number, visible?: boolean}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} extraMessage Optional error message shown if the element is not present in time.
 * @param {number?} timeout How long to wait, in milliseconds. (default: true)
 */
async function clickTestId(page, testId, {extraMessage=undefined, timeout=30000, visible=true} = {}) {
    _checkTestId(testId);

    const xpath = `//*[@data-testid="${testId}"]`;
    const extraMessageRepr = extraMessage ? `. ${extraMessage}` : '';
    const message = `Failed to find${visible ? ' visible' : ''} element with data-testid "${testId}" within ${timeout}ms${extraMessageRepr}`;
    return await clickXPath(page, xpath, {timeout, message, visible});
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

    // From https://stackoverflow.com/a/47292022/35070
    await page.setExtraHTTPHeaders({'Accept-Language': lang.join(',')}); // For HTTP requests
    await page.evaluateOnNewDocument(lang => { // For JavaScript code
        Object.defineProperty(navigator, 'language', {
            get: function() {
                return lang[0];
            }
        });
        Object.defineProperty(navigator, 'languages', {
            get: function() {
                return lang;
            }
        });
    }, lang);
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
    await page.waitForSelector(selector);
    return page.$eval(
        selector,
        (el, propName) => {
            if (propName in el) {
                const value = el[propName];
                return propName === 'style' ? value.cssText : value;
            }
            return el.getAttribute(propName);
        },
        name,
    );
}

/**
 * Get the text content of a given DOM Element.
 *
 * @returns {import('puppeteer').Page} The puppeteer page handle.
 * @param {string} selector Query selector.
 * @returns {Promise<string>} Text content of the selected element.
 */
async function getText(page, selector) {
    return getAttribute(page, selector, 'textContent');
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
async function speedupTimeouts(page, {factor=100, persistent=false}={}) {
    function applyTimeouts(factor) {
        window._pentf_real_setTimeout = window._pentf_real_setTimeout || window.setTimeout;
        window.setTimeout = (func, delay, ...args) => {
            return window._pentf_real_setTimeout(func, delay && (delay / factor), ...args);
        };

        window._pentf_real_setInterval = window._pentf_real_setInterval || window.setInterval;
        window.setInterval = (func, delay, ...args) => {
            return window._pentf_real_setInterval(func, delay && (delay / factor), ...args);
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
async function html2pdf(config, path, html, modifyPage=null) {
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
    assertNotXPath,
    assertValue,
    clickNestedText,
    clickTestId,
    clickText,
    clickXPath,
    closePage,
    escapeXPathText,
    getAttribute,
    getSelectOptions,
    getText,
    html2pdf,
    newPage,
    restoreTimeouts,
    setLanguage,
    speedupTimeouts,
    waitForTestId,
    waitForText,
    waitForVisible,
};