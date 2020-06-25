const assert = require('assert').strict;
const {closePage, newPage} = require('../browser_utils');
const { wait } = require('../utils');

async function run(config) {
    const page = await newPage({...config, coverage: true});
    await page.goto('https://preactjs.com');


    await wait(1000);

    await closePage(page);
}

module.exports = {
    description: 'Collect code coverage information',
    resources: [],
    run,
};
