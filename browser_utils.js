'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const {promisify} = require('util');
const tmp = require('tmp-promise');

const {assertAsyncEventually, wait} = require('./utils');

let tmp_home;

async function newPage(config, chrome_args=[]) {
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
            tmp_home = (await tmp.dir({prefix: 'itest-chromium'})).path;

            // Set up .pki, to allow local certificate shenenigans (like mkcert)
            const mkdir = promisify(fs.mkdir);
            await mkdir(path.join(tmp_home, '.pki'));
            await mkdir(path.join(tmp_home, '.pki', 'nssdb'));
            const copyNssFile = async basename => {
                const source_file = path.join(process.env.HOME, '.pki', 'nssdb', basename);
                const exists = await new Promise(resolve =>
                    fs.access(source_file, fs.constants.F_OK, err => resolve(!err))
                );

                if (!exists) return;
                await promisify(fs.copyFile)(
                    source_file, path.join(tmp_home, '.pki', 'nssdb', basename));
            };
            await copyNssFile('cert9.db');
        }
        params.env = {
            ...process.env,
            HOME: tmp_home,
        };
    }
    const browser = await puppeteer.launch(params);

    if (config.devtools_preserve) {
        browser.on('targetcreated', async target => {
            if (! /^chrome-devtools:\/\//.test(await target.url())) {
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
        });
    }

    return browser.newPage();
}

async function closePage(page) {
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
    closePage,
    getSelectOptions,
    html2pdf,
    newPage,
    setLanguage,
    waitForVisible,
};