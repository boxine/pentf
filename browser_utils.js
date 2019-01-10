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

async function assert_value(input, expected) {
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

module.exports = {
    assert_value,
    close_page,
    new_page,
    waitForVisible,
};