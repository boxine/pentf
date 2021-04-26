const assert = require('assert').strict;
const runner = require('../src/runner');
const kolorist = require('kolorist');
const {
    newPage,
    closePage,
    waitForVisible,
    waitForText,
    waitForTestId,
    assertValue,
    assertNotXPath,
    clickSelector,
    clickXPath,
    clickText,
    clickNestedText,
    clickTestId,
    typeSelector,
    setLanguage,
    getAttribute,
    getText,
    workaround_setContent,
    assertNotSelector,
    assertNotTestId,
} = require('../src/browser_utils');

/**
 * @param {import('../src/runner').TaskConfig} config
 * @param {string} expected
 * @param {(config: import('../src/config').Config => Promise<void>)} fn
 */
async function execRunner(config, expected, fn) {
    const name = `${config._taskName}[${expected}]`.replace(/[/:]/g, '_');
    const output = [];
    /** @type {import('../src/config').Config} */
    const runnerConfig = {
        ...config,
        quiet: true,
        logFunc(config, message) {
            output.push(kolorist.stripColors(message));
        },
    };

    await runner.run(runnerConfig, [
        {
            name,
            run: async config => {
                await fn(config);
                throw new Error(`Timeout: Test case ${name}`);
            },
        },
    ]);

    assertOutput(output.join('\n'), expected);
}

function assertOutput(output, str) {
    assert(
        output.includes(`breadcrumb "exit ${str}"`),
        `Expected output to include "exit ${str}".\n\nOutput was: ${output}`
    );
}

async function run(config) {
    await execRunner(config, 'newPage()', async config => {
        await newPage(config);
    });

    await execRunner(config, 'closePage()', async config => {
        const page = await newPage(config);
        await closePage(page);
    });

    await execRunner(config, 'waitForVisible(div)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<div>foo</div>');
        await waitForVisible(page, 'div');
    });

    await execRunner(config, 'waitForText(foo)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<div>foo</div>');
        await waitForText(page, 'foo');
    });

    await execRunner(config, 'waitForTestId(foo)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<div data-testid="foo">foo</div>');
        await waitForTestId(page, 'foo');
    });

    await execRunner(config, 'assertValue(foo)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<input value="foo" />');
        const input = await page.$('input');
        await assertValue(input, 'foo');
    });

    await execRunner(config, 'assertNotSelector(span)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<div></div>');
        await assertNotSelector(page, 'span', { timeout: 2000 });
    });

    await execRunner(config, 'assertNotTestId(foo)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<div></div>');
        await assertNotTestId(page, 'foo', { timeout: 2000 });
    });

    await execRunner(config, 'assertNotXPath(//span)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<div></div>');
        await assertNotXPath(page, '//span');
    });

    await execRunner(config, 'clickSelector(button)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<button>foo</button>');
        await clickSelector(page, 'button');
    });

    await execRunner(config, 'clickXPath(//button)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<button>foo</button>');
        await clickXPath(page, '//button');
    });

    await execRunner(config, 'clickText(foo)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<button>foo</button>');
        await clickText(page, 'foo');
    });

    await execRunner(config, 'clickNestedText(foo)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<button>foo</button>');
        await clickNestedText(page, 'foo');
    });

    await execRunner(config, 'clickTestId(foo)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<button data-testid="foo">foo</button>');
        await clickTestId(page, 'foo');
    });

    await execRunner(config, 'typeSelector(input, text: foo)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<input />');
        await typeSelector(page, 'input', 'foo');
    });

    await execRunner(config, 'setLanguage(foo)', async config => {
        const page = await newPage(config);
        await setLanguage(page, 'foo');
    });

    await execRunner(config, 'getAttribute(div, attr: class)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<div class="foo"></div>');
        await getAttribute(page, 'div', 'class');
    });

    await execRunner(config, 'getText(div)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<div class="foo"></div>');
        await getText(page, 'div');
    });

    // Should add breadcrumbs to native page functions
    await execRunner(config, 'page.goto(https://example.com)', async config => {
        const page = await newPage(config);
        await page.goto('https://example.com');
    });

    await execRunner(config, 'page.$(div)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<div />');
        await page.$('div');
    });

    await execRunner(config, 'page.$$(div)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<div />');
        await page.$$('div');
    });

    await execRunner(config, 'page.$eval()', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<div />');
        await page.$eval('div', () => null);
    });

    await execRunner(config, 'page.$$eval()', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<div />');
        await page.$$eval('div', () => null);
    });

    await execRunner(config, 'page.click(button)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<button />');
        await page.click('button');
    });

    await execRunner(config, 'page.evaluate()', async config => {
        const page = await newPage(config);
        await page.evaluate(() => null);
    });

    await execRunner(config, 'page.type(input, foo)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<input />');
        await page.type('input', 'foo');
    });

    await execRunner(config, 'page.waitForSelector(div)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<div />');
        await page.waitForSelector('div');
    });

    await execRunner(config, 'page.waitForFunction()', async config => {
        const page = await newPage(config);
        await page.waitForFunction(() => true);
    });

    await execRunner(config, 'page.waitForXPath(//div)', async config => {
        const page = await newPage(config);
        await workaround_setContent(page, '<div />');
        await page.waitForXPath('//div');
    });
}

module.exports = {
    run,
    description: 'Display breadcrumb on timeout error',
};
