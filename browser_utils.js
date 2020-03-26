'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {promisify} = require('util');
const tmp = require('tmp-promise');

const {assertAsyncEventually, wait, remove} = require('./utils');

let tmp_home;

/**
 * Launch a new page
 * @param {*} config 
 * @param {string[]} [chrome_args] 
 * @returns {import('puppeteer').Page}
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
        page._pintf_browser_pages = config._browser_pages;
        config._browser_pages.push(page);
    }

    return page;
}

/**
 * @param {import('puppeteer').Page} page 
 */
async function closePage(page) {
    if (page._pintf_browser_pages) {
        remove(page._pintf_browser_pages, p => p === page);
    }

    const browser = await page.browser();
    await page.close();
    await browser.close();
}

/**
 * @param {import('puppeteer').Page} page 
 * @param {string} selector
 * @param {{timeout?: number, message?: string}} [options]
 * @returns {Promise<import('puppeteer').ElementHandle>}
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
 * @param {string} text 
 */
function escapeXPathText(text) {
    if (!text.includes('"')) {
        // No doubles quotes ("), simple case
        return `"${text}"`;
    }
    return 'concat(' + text.split('"').map(part => `"${part}"`).join(', \'"\', ') + ')';
}

/**
 * @param {string} text 
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
 * @param {import('puppeteer').Page} page
 * @param {string} text
 * @param {{timeout?: number, extraMessage?: string}} [options]
 * @returns {Promise<import('puppeteer').ElementHandle>}
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

function _checkTestId(testId) {
    if (typeof testId !== 'string') throw new Error(`Invalid testId type ${testId}`);
    assert(/^[-a-zA-Z0-9_.]+$/.test(testId), `Invalid testId ${JSON.stringify(testId)}`);
}

/**
 * @param {import('puppeteer').Page} page 
 * @param {string} testId 
 * @param {{extraMessage?: string, timeout?: number, visible?: boolean}} [options] 
 * @returns {Promise<import('puppeteer').ElementHandle>}
 */
async function waitForTestId(page, testId, {extraMessage=undefined, timeout=undefined, visible=true} = {}) {
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
 * @param {import('puppeteer').ElementHandle} input 
 * @param {string} expected 
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
 * Assert that there is currently no element matching the xpath on the page
 * @param {import('puppeteer').Page} page
 * @param {string} xpath
 * @param {string} [message]
 * @param {number} [wait_ms] 
 * @param {number} [check_every]
 */
async function assertNotXPath(page, xpath, message='', wait_ms=2000, check_every=200) {
    while (true) { // eslint-disable-line no-constant-condition
        const found = await page.evaluate(xpath => {
            const element = document.evaluate(
                xpath, document, null, window.XPathResult.ANY_TYPE, null).iterateNext();
            return !!element;
        }, xpath);
        assert(!found,
            'Element matching ' + xpath + ' is present, but should not be there.' +
            (message ? ' ' + message : ''));

        if (wait_ms <= 0) {
            break;
        }

        await wait(Math.min(check_every, wait_ms));
        wait_ms -= check_every;
    }
}

/**
 * Clicks an element atomically, e.g. within the same event loop run as finding it
 * @param {import('puppeteer').Page} page 
 * @param {string} xpath 
 * @param {{timeout?: number, checkEvery?: number, message?: string, visible?: boolean}} [options] 
 */
async function clickXPath(page, xpath, {timeout=30000, checkEvery=200, message=undefined, visible=true} = {}) {
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
 * Click a link or button by its text content
 * @param {import('puppeteer').Page} page 
 * @param {string} text 
 * @param {{timeout?: number, checkEvery?: number, elementXPath?: string, extraMessage?: string}} [options] 
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
 * @param {import('puppeteer').Page} page 
 * @param {string} testId 
 * @param {{extraMessage?: string, timeout?: number, visible?: boolean}} [options] 
 */
async function clickTestId(page, testId, {extraMessage=undefined, timeout=30000, visible=true} = {}) {
    _checkTestId(testId);

    const xpath = `//*[@data-testid="${testId}"]`;
    const extraMessageRepr = extraMessage ? `. ${extraMessage}` : '';
    const message = `Failed to find${visible ? ' visible' : ''} element with data-testid "${testId}" within ${timeout}ms${extraMessageRepr}`;
    return await clickXPath(page, xpath, {timeout, message, visible});
}

/**
 * lang can either be a single string (e.g. "en") or an array of supported languages (e.g. ['de-DE', 'en-US', 'gr'])
 * @param {import('puppeteer').Page} page 
 * @param {string | string[]} lang 
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
 * Get all options of a select as an array of strings, e.g. ['Option A', 'Option B(***)', 'Option C']
 * @param {import('puppeteer').Page} page 
 * @param {import('puppeteer').ElementHandle<HTMLSelectElement>} select 
 * @returns {Promise<string[]>}
 */
async function getSelectOptions(page, select) {
    return await page.evaluate(select => {
        return Array.from(select.options).map(option => {
            return option.innerText + (option.selected ? '(***)' : '');
        });
    }, select);
}

/**
 * @param {import('puppeteer').Page} page 
 * @param {{factor?: number, persistent?: boolean}} [options]
 */
async function speedupTimeouts(page, {factor=100, persistent=false}={}) {
    function applyTimeouts(factor) {
        window._pintf_real_setTimeout = window._pintf_real_setTimeout || window.setTimeout;
        window.setTimeout = (func, delay, ...args) => {
            return window._pintf_real_setTimeout(func, delay && (delay / factor), ...args);
        };

        window._pintf_real_setInterval = window._pintf_real_setInterval || window.setInterval;
        window.setInterval = (func, delay, ...args) => {
            return window._pintf_real_setInterval(func, delay && (delay / factor), ...args);
        };
    }

    if (persistent) {
        await page.evaluateOnNewDocument(applyTimeouts, factor);
    } else {
        await page.evaluate(applyTimeouts, factor);
    }
}

/**
 * @param {import('puppeteer').Page} page 
 */
async function restoreTimeouts(page) {
    await page.evaluate(() => {
        if (window._pintf_real_setTimeout) {
            window.setTimeout = window._pintf_real_setTimeout;
        }
        if (window._pintf_real_setInterval) {
            window.setInterval = window._pintf_real_setInterval;
        }
    });
}

/**
 * @param {import('puppeteer').Page} page 
 * @param {string} html
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
async function html2pdf(config, path, html, modifyPage=null) {
    const pdfConfig = {...config};
    pdfConfig.headless = true;
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
    clickTestId,
    clickText,
    clickXPath,
    closePage,
    escapeXPathText,
    getSelectOptions,
    html2pdf,
    newPage,
    restoreTimeouts,
    setLanguage,
    speedupTimeouts,
    waitForTestId,
    waitForText,
    waitForVisible,
};