'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {promisify} = require('util');
const tmp = require('tmp-promise');

const {assertAsyncEventually, wait, remove} = require('./utils');

let tmp_home;

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
            }, 'could not toggle preserve options in devtools', 10000, 100);
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

async function closePage(page) {
    if (page._pintf_browser_pages) {
        remove(page._pintf_browser_pages, p => p === page);
    }

    const browser = await page.browser();
    await page.close();
    await browser.close();
}

async function waitForVisible(page, selector) {
    const el = await page.waitForFunction(qs => {
        const all = document.querySelectorAll(qs);
        if (all.length !== 1) return null;
        const el = all[0];
        if (el.offsetParent === null) return null;
        return el;
    }, {}, selector);
    assert(el !== null);
    return el;
}

function escapeXPathText(text) {
    if (!text.includes('"')) {
        // No doubles quotes ("), simple case
        return `"${text}"`;
    }
    return 'concat(' + text.split('"').map(part => `"${part}"`).join(', \'"\', ') + ')';
}

async function waitForText(page, text, {timeout=30000}={}) {
    const xpath = `//text()[contains(., ${escapeXPathText(text)})]`;
    try {
        return await page.waitForXPath(xpath, {timeout});
    } catch (e) {
        throw new Error(`Unable to find text ${JSON.stringify(text)} after ${timeout}ms`);
    }
}

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

// Assert that there is currently no element matching the xpath on the page
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

// Clicks an element atomically, e.g. within the same event loop run as finding it
async function clickXPath(page, xpath, {timeout=30000, checkEvery=200, message=undefined} = {}) {
    let remainingTimeout = timeout;
    while (true) { // eslint-disable-line no-constant-condition
        const found = await page.evaluate(xpath => {
            const element = document.evaluate(
                xpath, document, null, window.XPathResult.ANY_TYPE, null).iterateNext();
            if (!element) return false;

            if (element.offsetParent === null) return null; // invisible

            element.click();
            return true;
        }, xpath);

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

// Click a link or button by its text content
async function clickText(page, text, {timeout=30000, checkEvery=200}={}) {
    const xpath = (
        '//*[local-name()="a" or local-name()="button" or local-name()="input"]' +
        `[contains(text(), ${escapeXPathText(text)})]`);
    return clickXPath(page, xpath, {
        timeout,
        checkEvery,
        message: `Unable to find text ${JSON.stringify(text)} after ${timeout}ms`,
    });
}

// lang can either be a single string (e.g. "en") or an array of supported languages (e.g. ['de-DE', 'en-US', 'gr'])
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

// Get all options of a select as an array of strings, e.g. ['Option A', 'Option B(***)', 'Option C']
async function getSelectOptions(page, select) {
    return await page.evaluate(select => {
        const option_elements = Array.from(select.querySelectorAll('option'));
        return option_elements.map(option => {
            return option.innerText + (select.value == option.value ? '(***)' : '');
        });
    }, select);
}

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
    clickText,
    clickXPath,
    closePage,
    getSelectOptions,
    html2pdf,
    newPage,
    setLanguage,
    waitForText,
    waitForVisible,
};