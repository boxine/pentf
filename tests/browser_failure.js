const {closePage, newPage} = require('../browser_utils');

async function run(config) {
    const closed = await newPage(config);
    await closed.setContent('already closed');
    await closePage(closed);

    const page0 = await newPage(config);
    await page0.setContent('<style>*{font-size:50px;}</style>This is the first page.');

    const foreground = await newPage(config);
    await foreground.setContent(
        '<style>*{font-size:50px;background:#f88;}</style>This is the second page.');

    throw new Error('Test failed (this will cause screenshots)');
}

module.exports = {
    description: 'Reproduces a browser failure. This is not a selftest; more of a demo.',
    resources: [],
    run,
    skip: () => !process.env.PENTF_DEMO && 'PENTF_DEMO environment variable not set',
    expectedToFail: () => process.env.PENTF_DEMO && (
        'This test will fail in order to demonstrate how pentf handles errors.' +
        ' In a real test, we would likely mention a ticket number or URL here.'),
};
