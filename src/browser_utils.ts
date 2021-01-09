import { Browser, ElementHandle, Frame, LaunchOptions, Page, Request, Target } from "puppeteer";
import { Config } from "./config";

/**
 * Browser functions, based upon puppeteer.
 * These functions extend [the puppeteer API](https://github.com/puppeteer/puppeteer/blob/master/docs/api.md).
 * @packageDocumentation
 */

import {strict as assert} from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {promisify} from 'util';
import * as tmp from 'tmp-promise';
import {performance} from 'perf_hooks';
import * as mkdirpCb from 'mkdirp';

import {assertAsyncEventually} from './assert_utils';
import {forwardBrowserConsole} from './browser_console';
import {wait, remove} from './utils';
import {timeoutPromise} from './promise_utils';
import { importFile } from './loader';
import * as output from './output';
import { isTaskConfig, TaskConfig } from "./runner";
import { AxeResults } from "axe-core";

declare global {
    interface Window {
        axe: any;
        _pentf_real_setTimeout?: any;
        _pentf_real_setInterval?: any;
    }
}

export interface PentfBrowser extends Browser {
    _connection: {
        send: (messge: string, options?: Record<string, any>) => Promise<any>
    };
    _pentf_config: TaskConfig;
    _logs: any[]
}

export interface PentfPage extends Page {
    _pentf_intercept_handlers: any[]
}

const mkdirp = promisify(mkdirpCb);

let tmp_home: string;

/**
 * Ignore these errors
 */
function ignorerError(err: Error) {
    return /Execution context was destroyed/.test(err.message);
}

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
 * @param {import('./runner').TaskConfig} config The pentf configuration object.
 * @param {string[]} [chrome_args] Additional arguments for Chrome (optional).
 * @returns {import('puppeteer').Page} The puppeteer page handle.
 */
export async function newPage(config: TaskConfig | Config, chrome_args: string[]=[]) {
    addBreadcrumb(config, 'enter newPage()');
    let puppeteer: typeof import('puppeteer');
    try {
        if(config.puppeteer_firefox) {
            puppeteer = await importFile('puppeteer-firefox', config.moduleType);
        } else {
            puppeteer = await importFile('puppeteer', config.moduleType);
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

    const params: LaunchOptions = {
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
            const copyNssFile = async (basename: string) => {
                const source_file = path.join(process.env.HOME as string, '.pki', 'nssdb', basename);
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

    // Resize browser to actual viewport width
    if (!config.headless) {
        params.defaultViewport = null;
    }

    const browser = await puppeteer!.launch(params) as PentfBrowser;
    const page = (await browser.pages())[0];

    if (config.devtools_preserve) {
        const configureDevtools = async (target: any) => {
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

    // Make sure that the browser window matches the viewport size
    if (!config.headless) {
        // Default puppeteer viewport size
        // TODO: Make this configurable for users
        const expected = { width: 800, height: 600 };
        const actual = await page.evaluate(() => {
            return { width: window.innerWidth, height: window.innerHeight };
        });

        if (actual.width !== expected.width || actual.height !== expected.height) {
            // Get browser tab and resize window via devtools protocol
            const targets = await browser._connection.send(
                'Target.getTargets'
            );
            const target = targets.targetInfos.find((t: any) => t.attached === true && t.type === 'page');
            if (!target) {
                throw new Error('INTERNAL ERROR: Missing page in window');
            }
            const {windowId} = await browser._connection.send(
                'Browser.getWindowForTarget',
                {targetId: target.targetId}
            );
            const {bounds} = await browser._connection.send(
                'Browser.getWindowBounds',
                {windowId}
            );

            // Resize to correct dimensions
            await browser._connection.send('Browser.setWindowBounds', {
                bounds: {
                    width: bounds.width + expected.width - actual.width,
                    height: bounds.height + expected.height - actual.height
                },
                windowId
            });
        }
    }

    browser._logs = [];
    if (config.forward_console) {
        await forwardBrowserConsole(config, page);
    }

    if (config._browser_pages) {
        config._browser_pages.push(page);
    }

    if (config.breadcrumbs && isTaskConfig(config)) {
        withBreadcrumb(config, page, '$', (selector) => `page.$(${selector})`);
        withBreadcrumb(config, page, '$$', (selector) => `page.$$(${selector})`);
        withBreadcrumb(config, page, '$eval', () => 'page.$eval()');
        withBreadcrumb(config, page, '$$eval', () => 'page.$$eval()');
        withBreadcrumb(config, page, 'click', (selector) => `page.click(${selector})`);
        withBreadcrumb(config, page, 'evaluate', () => 'page.evaluate()');
        withBreadcrumb(config, page, 'goto', (url) => `page.goto(${url})`);
        withBreadcrumb(config, page, 'type', (selector, text) => `page.type(${selector}, ${text})`);
        withBreadcrumb(config, page, 'waitForSelector', (selector) => `page.waitForSelector(${selector})`);
        withBreadcrumb(config, page, 'waitForFunction', () => 'page.waitForFunction()');
        withBreadcrumb(config, page, 'waitForXPath', (xpath) => `page.waitForXPath(${xpath})`);
    }

    // The Browser instance is the nearest shared ancestor across pages
    // and frames.
    (browser as any)._pentf_config = config;
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

    return page;
}

function isPage(x: any): x is Page {
    return x !== null && typeof x === 'object' && typeof x.browser === 'function'
}

/**
 * Get browser instance from a Page or Frame instance
 * @param {import('puppeteer').Page | import('puppeteer').Frame} pageOrFrame
 * @private
 */
function getBrowser(pageOrFrame: Page | Frame) {
    if (isPage(pageOrFrame)) {
        return pageOrFrame.browser();
    } else {
        return (pageOrFrame as any)._frameManager._page.browser();
    }
}

/**
 * Get the default timeout from a Page or Frame instance
 * @param {import('puppeteer').Page | import('puppeteer').Frame} pageOrFrame
 * @private
 */
function getDefaultTimeout(pageOrFrame: Page | Frame) {
    return getBrowser(pageOrFrame)._pentf_config.default_timeout;
}

/**
 * Mark progress in test. Useful for when the test times out and there is no
 * hint as to why.
 * @param config
 * @param name
 * @private
 */
function addBreadcrumb(config: Config | TaskConfig, name: string) {
    if (config.breadcrumbs && isTaskConfig(config)) {
        const time = Math.round(performance.now() - config.start);
        config._breadcrumb = new Error(`Last breadcrumb "${name}" at ${time}ms after test started.`);
    }
}

function withBreadcrumb<T extends keyof Page>(config: TaskConfig, page: Page, prop: T, getName: (...args: any[]) => string) {
    const original = (page as any)[prop];
    (page as any)[prop] = (...args: any[]) => {
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
export async function closePage(page: Page) {
    const browser = getBrowser(page);
    const config = browser._pentf_config;
    addBreadcrumb(config, 'enter closePage()');

    // Wait for all pending logging tasks to finish before closing browser
    await timeoutPromise(
        config, Promise.all(browser._logs), {message: 'Aborting waiting on page logs'});

    if (config._pentf_browser_pages) {
        remove(config._pentf_browser_pages, p => p === page);
    }

    await timeoutPromise(config, page.close(), {message: 'Closing the page took too long'});
    await timeoutPromise(config, browser.close(), {message: 'Closing the browser took too long'});
    addBreadcrumb(config, 'exit closePage()');
}

export interface TimeoutOptions {
    /** Error message shown if the element is not visible in time. */
    message?: string;
    /** How long to wait, in milliseconds. */
    timeout?: number;
}

export interface RetryOptions {
    /** @deprecated Use `retryUntil` instead */
    assertSuccess?: () => Promise<boolean>;
    /**
     * Additional check to verify that the operation was successful. This is needed in cases where
     * a DOM node is present and we clicked on it, but the framework that rendered the node
     * didn't set up any event listeners yet.
     */
    retryUntil?: () => Promise<boolean>;
}

export interface VisibleOption {
    /** Whether the element must be visible within the timeout. (default: `true`) */
    visible?: boolean;
}

export interface CheckEveryOption {
    /** Intervals between checks, in milliseconds. (default: 200ms) */
    checkEvery?: number;
}

export interface ExtraMessageOption {
    /** Optional error message shown if the element is not present in time. */
    extraMessage?: string;
}

/**
 * Wait for an element matched by a CSS query selector to become visible.
 * Visible means the element has neither `display:none` nor `visibility:hidden`.
 * Elements outside the current viewport (e.g. you'd need to scroll) and hidden with CSS trickery
 * (opacity, overlaid with z-index, or permanently positioned outside the viewport) count as visible.
 *
 * @param page puppeteer page object.
 * @param selector Query selector, e.g. `div > a[href="/"]:visited`
 * @param options Options
 
 * @returns A handle to the found element.
 */
export async function waitForVisible(page: Page, selector: string, {message, timeout=getDefaultTimeout(page)}: TimeoutOptions = {}): Promise<ElementHandle> {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter waitForVisible(${selector})`);

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
    addBreadcrumb(config, `exit waitForVisible(${selector})`);
    return el as any;
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
export function escapeXPathText(text: string) {
    if (!text.includes('"')) {
        // No doubles quotes ("), simple case
        return `"${text}"`;
    }
    return 'concat(' + text.split('"').map(part => `"${part}"`).join(', \'"\', ') + ')';
}

/**
 * @hidden
 */
function checkText(text: string) {
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

export interface WaitForTextOptions extends ExtraMessageOption {
    /** How long to wait, in milliseconds. */
    timeout?: number;
}

/**
 * Wait for text to appear on the page.
 *
 * @param page puppeteer page object.
 * @param text String to look for.
 * @param options

 * @returns A handle to the text node.
 */
export async function waitForText(page: Page, text: string, {timeout=getDefaultTimeout(page), extraMessage}: WaitForTextOptions={}): Promise<ElementHandle> {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter waitForText(${text})`);
    checkText(text);
    const extraMessageRepr = extraMessage ? ` (${extraMessage})` : '';
    const err = new Error(`Unable to find text ${JSON.stringify(text)} after ${timeout}ms${extraMessageRepr}`);

    const xpath = `//text()[contains(., ${escapeXPathText(text)})]`;
    try {
        const res = await page.waitForXPath(xpath, {timeout});
        addBreadcrumb(config, `exit waitForText(${text})`);
        return res;
    } catch (e) {
        throw err;
    }
}

/**
 * @hidden
 */
function _checkTestId(testId: string) {
    if (typeof testId !== 'string') throw new Error(`Invalid testId type ${testId}`);
    assert(/^[-a-zA-Z0-9_.]+$/.test(testId), `Invalid testId ${JSON.stringify(testId)}`);
}

export interface WaitForTestIdOptions extends VisibleOption, ExtraMessageOption {
    /** How long to wait, in milliseconds. */
    timeout?: number;
}

/**
 * Search for an element with the given `data-testid` attribute.
 *
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param testId The test id to search
 * @param options Options
 * @returns Handle to the element with the given test ID.
 */
export async function waitForTestId(page: Page, testId: string, {extraMessage, timeout=getDefaultTimeout(page), visible=true}: WaitForTestIdOptions = {}): Promise<ElementHandle> {
    _checkTestId(testId);
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter waitForTestId(${testId})`);

    const err = new Error(
        `Failed to find ${visible ? 'visible ' : ''}element with data-testid "${testId}" within ${timeout}ms` +
        (extraMessage ? `. ${extraMessage}` : ''));

    const qs = `*[data-testid="${testId}"]`;
    let el;
    try {
        el = await page.waitForFunction((qs, visible) => {
            const all = document.querySelectorAll(qs);
            if (all.length < 1) return null;
            const [el] = all as any;
            if (visible && (el.offsetParent === null)) return null;
            return el;
        }, {timeout}, qs, visible);
    } catch (e) {
        throw err; // Do not construct error here lest stack trace gets lost
    }
    assert(el !== null);
    addBreadcrumb(config, `exit waitForTestId(${testId})`);
    return el as any;
}

/**
 * Assert an `<input>` element having a certain value (after a wait if necessary).
 *
 * @param input A puppeteer handle to an input element.
 * @param expected The value that is expected to be present.
 */
export async function assertValue(input: ElementHandle, expected: string) {
    const page = (input as any)._page;
    assert(page);
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter assertValue(${expected})`);
    try {
        await page.waitForFunction((inp: HTMLInputElement, expected: any) => {
            return inp.value === expected;
        }, {timeout: 2000}, input, expected);
        addBreadcrumb(config, `exit assertValue(${expected})`);
    } catch (e) {
        if (e.name !== 'TimeoutError') throw e;

        const {value, name, id} = await page.evaluate((inp: HTMLInputElement) => {
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

export interface AssertNotXPathOptions {
    /** Error message shown if the element is not visible in time. */
    message?: string;
    /** How long to wait, in milliseconds. (Default: 2s) */
    timeout?: number;
     /** Intervals between checks, in milliseconds. */
    checkEvery?: number;
}

/**
 * Assert that there is currently no element matching the XPath on the page.
 *
 * @param page puppeteer page object.
 * @param xpath XPath to search for.
 * @param options
 */
export async function assertNotXPath(page: Page, xpath: string, options: AssertNotXPathOptions, _timeout=2000, _checkEvery=200) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter assertNotXPath(${xpath})`);
    assert.equal(
        typeof xpath, 'string',
        `XPath ${xpath} should be a string, but is of type ${typeof xpath}`);

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
                const element = document.evaluate(
                    xpath, document, null, window.XPathResult.ANY_TYPE, null).iterateNext();
                return !!element;
            }, xpath);
        } catch(err) {
            if (!ignorerError(err)) {
                throw err;
            }
        }
        assert(!found,
            'Element matching ' + xpath + ' is present, but should not be there.' +
            (message ? ' ' + message : ''));

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
 */
async function onSuccess(fn?: () => Promise<boolean>) {
    if (!fn) return true;

    const res = await fn();
    if (!res) {
        throw new Error('retryUntil/assertSuccess returned a falsy value');
    }

    return true;
}

/**
 * Clicks an element address    ed by a query selector atomically, e.g. within the same event loop run as finding it.
 *
 * @example
 * ```javascript
 * await clickSelector(page, 'div[data-id="foo"] a.view', {message: 'Could not click foo link'});
 * ```
 * @param page puppeteer page object.
 * @param selector [CSS selector](https://www.w3.org/TR/2018/REC-selectors-3-20181106/#selectors) (aka query selector) of the targeted element.
 * @param options
 */
export async function clickSelector(page: PentfPage, selector: string, {timeout=getDefaultTimeout(page), checkEvery=200, message, visible=true, assertSuccess, retryUntil}: TimeoutOptions & RetryOptions & VisibleOption & CheckEveryOption = {}) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter clickSelector(${selector})`);
    assert.equal(typeof selector, 'string', 'CSS selector should be string (forgot page argument?)');

    let remainingTimeout = timeout;
    let retryUntilError = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        let found = false;
        try {
            found = await page.evaluate((selector, visible) => {
                const element = document.querySelector(selector);
                if (!element) return false;

                if (visible && element.offsetParent === null) return false; // invisible

                element.click();
                return true;
            }, selector, visible);
        } catch(err) {
            if (!ignorerError(err)) {
                throw err;
            }
        }

        try {
            if (found && (await onSuccess(retryUntil || assertSuccess))) {
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
                message = `Unable to find ${visible ? 'visible ' : ''}element ${selector} after ${timeout}ms`;
            }
            throw new Error(message);
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
 * @param page puppeteer page object.
 * @param selector [CSS selector](https://www.w3.org/TR/2018/REC-selectors-3-20181106/#selectors) (aka query selector) of the targeted element.
 * @param options Options (currently not visible in output due to typedoc bug)
 */
export async function assertNotSelector(page: PentfPage, selector: string, {timeout=getDefaultTimeout(page), message}: TimeoutOptions = {}) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter assertNotSelector(${selector})`);
    try {
        await page.waitForSelector(selector, {timeout});
    } catch(err) {
        addBreadcrumb(config, `exit assertNotSelector(${selector})`);
        return;
    }

    throw new Error(`Element matching ${selector} is present, but should not be there. ${message ? ' ' + message : ''}`);
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
 * @param page puppeteer page object.
 * @param xpath XPath selector to match the element.
 * @param options Options
 */
export async function clickXPath(
    page: Page,
    xpath: string,
    options: RetryOptions & TimeoutOptions & VisibleOption & CheckEveryOption = {}
) {
    let {
        timeout = getDefaultTimeout(page),
        checkEvery = 200,
        message = undefined,
        visible = true,
        assertSuccess,
        retryUntil,
    } = options;
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
                (xpath, visible) => {
                    const element = document
                        .evaluate(xpath, document, null, window.XPathResult.ANY_TYPE, null)
                        .iterateNext() as any;
                    if (!element) return false;

                    if (visible && element.offsetParent === null) return false; // invisible

                    element.click();
                    return true;
                },
                xpath,
                visible
            );
        } catch (err) {
            if (!ignorerError(err)) {
                throw err;
            }
        }

        try {
            if (found && (await onSuccess(retryUntil || assertSuccess))) {
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

export interface ClickTextOptions extends TimeoutOptions, RetryOptions, CheckEveryOption {
    /**
     * XPath selector for the elements to match. By default matching `a`, `button`, `input`,
     * `label`. `'//*'` to match any element.
     */
    elementXPath?: string;
    /** Optional error message shown if the element is not visible in time. */
    extraMessage?: string;
}

/**
 * Click a link, button, label, or input by its text content.
 *
 * @param page puppeteer page object.
 * @param text Text that the element must contain.
 * @param options Options (currently not visible in output due to typedoc bug)
 * @param {string?} extraMessage Optional error message shown if the element is not visible in time.
 * @param {number?} checkEvery Intervals between checks, in milliseconds. (default: 200ms)
 * @param {string} elementXPath
 */
export async function clickText(page: Page, text: string, {timeout=getDefaultTimeout(page), checkEvery=200, elementXPath=DEFAULT_CLICKABLE, extraMessage, assertSuccess, retryUntil}: ClickTextOptions={}) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter clickText(${text})`);
    checkText(text);
    const xpath = (
        elementXPath +
        `[contains(text(), ${escapeXPathText(text)})]`);
    const extraMessageRepr = extraMessage ? ` (${extraMessage})` : '';
    const res = await clickXPath(page, xpath, {
        timeout,
        checkEvery,
        retryUntil: retryUntil || assertSuccess,
        message: `Unable to find text ${JSON.stringify(text)} after ${timeout}ms${extraMessageRepr}`,
    });
    addBreadcrumb(config, `exit clickText(${text})`);
    return res;
}

/**
 * Click any element by its text content.
 *
 * The text can span multiple nodes compared to `clickText` which matches direct descended text nodes only.
 *
 * @param {import('puppeteer').Page} page puppeteer page object.
 * @param {string | RegExp} textOrRegExp Text or regex to match the text that the element must contain.
 * @param {{extraMessage?: string, timeout?: number, checkEvery?: number, visible?: boolean, assertSuccess?: () => Promise<boolean>, retryUntil?: () => Promise<boolean>}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {number?} timeout How long to wait, in milliseconds.
 * @param {number?} checkEvery Intervals between checks, in milliseconds. (default: 200ms)
 * @param {string?} extraMessage Optional error message shown if the element is not visible in time.
 * @param {boolean?} visible Optional check if element is visible (default: true)
 * @param {() => Promise<boolean>?} assertSuccess Deprecated: Alias of retryUntil
 * @param {() => Promise<boolean>?} retryUntil Additional check to verify that the operation was successful. This is needed in cases where a DOM node is present
 * and we clicked on it, but the framework that rendered the node didn't set up any event listeners yet.
 */
export async function clickNestedText(page: Page, textOrRegExp: string | RegExp, {timeout=getDefaultTimeout(page), checkEvery=200, extraMessage, visible=true, assertSuccess, retryUntil}: VisibleOption & RetryOptions & TimeoutOptions & CheckEveryOption & ExtraMessageOption ={}) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter clickNestedText(${textOrRegExp})`);
    if (typeof textOrRegExp === 'string') {
        checkText(textOrRegExp);
    }

    const serializedMatcher = typeof textOrRegExp !== 'string'
        ? {source: textOrRegExp.source, flags: textOrRegExp.flags}
        : textOrRegExp;

    let remainingTimeout = timeout;
    let retryUntilError = null;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        let found = false;

        try {
            found = await page.evaluate((matcher, visible) => {
                // eslint-disable-next-line no-undef
                /** @type {(text: string) => boolean} */
                let matchFunc;
                /** @type {null | (text: string) => boolean} */
                let matchFuncExact = null;

                if (typeof matcher == 'string') {
                    matchFunc = (text: string) => text.includes(matcher);
                } else {
                    const regexExact = new RegExp(matcher.source, matcher.flags);
                    matchFuncExact = (text: string) => {
                        // Reset regex state in case global flag was used
                        regexExact.lastIndex = 0;
                        return regexExact.test(text);
                    };

                    // Remove leading ^ and ending $, otherwise the traversal
                    // will fail at the first node.
                    const source = matcher.source
                        .replace(/^[^]/, '')
                        .replace(/[$]$/, '');
                    const regex = new RegExp(source, matcher.flags);
                    matchFunc = (text: string) => {
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
                                lastFound = child as any;
                            }
                            stack.push(child as any);
                        }
                    }
                }

                if (!lastFound) return false;

                if (visible && (lastFound as any).offsetParent === null) return false; // invisible)

                lastFound.click();
                return true;
            }, serializedMatcher, visible);
        } catch (err) {
            if (!ignorerError(err)) {
                throw err;
            }
        }

        try {
            if (found && await onSuccess(retryUntil || assertSuccess)) {
                addBreadcrumb(config, `exit clickNestedText(${textOrRegExp})`);
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
 * @param {{extraMessage?: string, timeout?: number, visible?: boolean, assertSuccess?: () => Promise<boolean>, retryUntil?: () => Promise<boolean>}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} extraMessage Optional error message shown if the element is not present in time.
 */
export async function clickTestId(page: Page, testId: string, {extraMessage, timeout=getDefaultTimeout(page), visible=true, assertSuccess, retryUntil}: VisibleOption & TimeoutOptions & RetryOptions & ExtraMessageOption = {}) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter clickTestId(${testId})`);
    _checkTestId(testId);

    const xpath = `//*[@data-testid="${testId}"]`;
    const extraMessageRepr = extraMessage ? `. ${extraMessage}` : '';
    const message = `Failed to find${visible ? ' visible' : ''} element with data-testid "${testId}" within ${timeout}ms${extraMessageRepr}`;
    const res = await clickXPath(page, xpath, {timeout, message, visible, retryUntil: retryUntil || assertSuccess});
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
 * @param page puppeteer page object.
 * @param testId The test ID to look for.
 * @param options
 */
export async function assertNotTestId(page: Page, testId: string, {timeout=getDefaultTimeout(page), message}: TimeoutOptions = {}) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter assertNotTestId(${testId})`);
    _checkTestId(testId);

    const xpath = `//*[@data-testid="${testId}"]`;
    try {
        await assertNotXPath(page, xpath, {timeout});
        addBreadcrumb(config, `exit assertNotTestId(${testId})`);
    } catch (err) {
        if (/Element\smatching/.test(err.message)) {
            throw new Error(`Element matching test id "${testId}" is present, but should not be there. ${message ? ' ' + message : ''}`);
        }
    }
}
/**
 * Type text into an element identified by a query selector.
 *
 * @param page puppeteer page object.
 * @param selector selector [CSS selector](https://www.w3.org/TR/2018/REC-selectors-3-20181106/#selectors) (aka query selector) of the element to type in.
 * @param text text to type
 * @param options
 */
export async function typeSelector(page: Page, selector: string, text: string, {message=undefined, timeout=getDefaultTimeout(page)}: TimeoutOptions={}) {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter typeSelector(${selector}, text: ${text})`);
    const el = await waitForVisible(page, selector, {timeout, message});
    await el.type(text);
    addBreadcrumb(config, `exit typeSelector(${selector}, text: ${text})`);
}

/**
 * Configure the browser's language.
 *
 * @param page The puppeteer page handle.
 * @param lang Either be a single string (e.g. "en") or an array of supported languages (e.g. `['de-DE', 'en-US', 'gr']`)
 */
export async function setLanguage(page: Page, lang: string | string[]) {
    if (typeof lang === 'string') {
        lang = [lang];
    }
    assert(Array.isArray(lang));
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter setLanguage(${lang.join(', ')})`);

    // From https://stackoverflow.com/a/47292022/35070
    await page.setExtraHTTPHeaders({'Accept-Language': lang.join(',')}); // For HTTP requests
    await page.evaluateOnNewDocument(lang => { // For JavaScript code
        Object.defineProperty(navigator, 'language', {
            // Allow future setLanguage() calls to overwrite this property
            configurable: true,
            get: function() {
                return lang[0];
            }
        });
        Object.defineProperty(navigator, 'languages', {
            // Allow future setLanguage() calls to overwrite this property
            configurable: true,
            get: function() {
                return lang;
            }
        });
    }, lang);
    addBreadcrumb(config, `exit setLanguage(${lang.join(', ')})`);
}

/**
 * Retrieve attribute value of a DOM element.
 *
 * @param page The puppeteer page handle.
 * @param selector Query selector for the element.
 * @param name Attribute name.
 * @returns The attribute value
 */
export async function getAttribute(page: Page, selector: string, name: string): Promise<string> {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter getAttribute(${selector}, attr: ${name})`);
    await page.waitForSelector(selector);
    const res = await page.$eval(
        selector,
        (el, propName) => {
            if (propName in el) {
                const value = (el as any)[propName];
                return propName === 'style' ? value.cssText : value;
            }
            return el.getAttribute(propName);
        },
        name,
    );
    addBreadcrumb(config, `exit getAttribute(${selector}, attr: ${name})`);
    return res;
}

/**
 * Get the text content of a given DOM Element.
 *
 * @param page The puppeteer page handle.
 * @param selector Query selector.
 * @returns Text content of the selected element.
 */
export async function getText(page: Page, selector: string): Promise<string> {
    const config = getBrowser(page)._pentf_config;
    addBreadcrumb(config, `enter getText(${selector})`);
    const res = await getAttribute(page, selector, 'textContent');
    addBreadcrumb(config, `exit getText(${selector})`);
    return res;
}

/**
 * Get all options of a `<select>` as an array of strings. The selected option is suffixed with `(***)`.
 *
 * @param page The puppeteer page handle.
 * @param select puppeteer handl eto the `<select>`.
 * @returns e.g. `['Option A', 'Option B(***)', 'Option C']`
 */
export async function getSelectOptions(page: Page, select: ElementHandle<HTMLSelectElement>): Promise<string[]> {
    return await page.evaluate(select => {
        return Array.from((select as HTMLSelectElement).options).map(option => {
            return option.innerText + (option.selected ? '(***)' : '');
        });
    }, select);
}

/**
 * @param config
 * @param page The puppeteer page handle.
 * @param fileName Where to write the screenshot to
 * @param selector if specified only the element matching the selector will be screenshotted
 */
export async function takeScreenshot(config: Config, page: Page, fileName: string, selector?: string) {
    await (mkdirp as any)(config.screenshot_directory);
    const fn = path.join(config.screenshot_directory, fileName);

    const viewport = page.viewport();
    let img;
    if (selector) {
        const el = await page.waitForSelector(selector);
        img = await el.screenshot({
            path: fn,
            type: 'png',
        });
    } else {
        img = await page.screenshot({
            path: fn,
            type: 'png',
            fullPage: true,
        });
    }

    // Restore emulation, fixes unable to resize window after taking a screenshot.
    await (page as any)._client.send('Emulation.clearDeviceMetricsOverride');

    // Restore potential emulation settings that were active before
    // we took the screenshot.
    if (viewport !== null) {
        await page.setViewport(viewport);
    }

    return img;
}

export type A11yImpact = "minor" | "moderate" | "serious" | "critical";

export interface A11yNode {
    html: string;
    screenshots: Array<Buffer | null>;
    selectors: string[];
}

export interface A11yResult {
    impact: A11yImpact;
    helpUrl?: string;
    description: string;
    nodes: A11yNode[];
}

export async function assertAccessibility(config: TaskConfig, page: Page) {
    assert(config, 'Missing config argument');
    assert(page, 'Missing page argument');

    output.logVerbose(config, '[a11y] Checking for accessibility errors...');

    const url = page.url();

    await page.addScriptTag({
        path: require.resolve('axe-core')
    });

    const results: AxeResults = await page.evaluate(() => {
        return new Promise((resolve, reject) => {
            window.axe.run(document, { ancestry: true }, (err: Error, results: AxeResults) => {
                if (err !== null) reject(err);
                else resolve(results);
            });
        });
    }) as any;

    const errors = config.accessibilityErrors;

    let i = errors.length;
    for (const v of results.violations) {

        /** @type {A11yNode[]} */
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
                        output.logVerbose(config, '[runner] Could not take screenshot ' + err.message);
                        return null;
                    }
                }
            }

            nodes.push({
                html: node.html,
                selectors: node.ancestry || [],
                screenshots: imgs
            });
        }

        errors.push({
            impact: v.impact || 'minor',
            helpUrl: v.helpUrl,
            description: v.help,
            nodes
        });
    }

    output.logVerbose(config, '[a11y] Checking for accessibility errors... Done');

    if (errors.length > 0) {
        const err = new Error(`There were ${errors.length} accessibility violations on ${url}`);
        (err as any).accessibilityErrors = errors;
        throw err;
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
export async function speedupTimeouts(page: Page, {factor=100, persistent=false}={}) {
    function applyTimeouts(factor: number) {
        window._pentf_real_setTimeout = window._pentf_real_setTimeout || window.setTimeout;
        window.setTimeout = ((func: any, delay: number, ...args: any[]) => {
            return window._pentf_real_setTimeout(func, delay && (delay / factor), ...args);
        }) as any;

        window._pentf_real_setInterval = window._pentf_real_setInterval || window.setInterval;
        window.setInterval = ((func: any, delay: number, ...args: any[]) => {
            return window._pentf_real_setInterval(func, delay && (delay / factor), ...args);
        }) as any;
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
export async function restoreTimeouts(page: Page) {
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
export async function workaround_setContent(page: Page, html: string) {
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
export async function interceptRequest(page: PentfPage, fn: (request: Request) => Promise<void> | void) {
    if (!page._pentf_intercept_handlers) {
        await page.setRequestInterception(true);

        page._pentf_intercept_handlers = [];
        page.on('request', async request => {
            for (const handler of page._pentf_intercept_handlers) {
                await handler(request);

                if ((request as any)._interceptionHandled) {
                    break;
                }
            }

            // Don't stall requests
            if (!(request as any)._interceptionHandled) {
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
export async function html2pdf(config: Config, path: string, html: string, modifyPage?: (page: Page) => Promise<void> ) {
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
