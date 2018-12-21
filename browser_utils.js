'use strict';

const assert = require('assert');

const puppeteer = require('puppeteer');

async function new_page(config) {
    const params = {
        args: ['--no-sandbox'],
        ignoreHTTPSErrors: (config.env !== 'prod'),
    };
    if (!config.headless) {
        params.headless = false;
    }
    if (config.slow_mo) {
        params.slowMo = config.slow_mo;
    }
    const browser = await puppeteer.launch(params);
    return browser.newPage();
}

async function close_page(page) {
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

module.exports = {
    close_page,
    new_page,
    waitForVisible,
};