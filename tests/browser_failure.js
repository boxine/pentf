const {closePage, newPage} = require('../browser_utils');

async function run(config) {
    const closed = await newPage(config);
    await closed.setContent('already closed');
    await closePage(closed);

    const page0 = await newPage(config);
    await page0.setContent('This is the first page');

    const foreground = await newPage(config);
    await foreground.setContent('<style>*{background:#f88;}</style>This is the second page');

    throw new Error('Test failed (this will cause screenshots)');
}

module.exports = {
    description: 'Reproduces a browser failure. This is not a selftest; more of a demo.',
    resources: [],
    run,
    skip: () => !process.env.PENTF_DEMO && 'PENTF_DEMO environment variable not set',
};
