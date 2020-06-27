const assert = require('assert').strict;
const path = require('path');
const fs = require('fs').promises;
const {closePage, newPage} = require('../browser_utils');
const { wait } = require('../utils');
const { launchServer } = require('./utils/static_server');

async function run(config) {
    const page = await newPage(config);

    const server = await launchServer(config, path.join(__dirname, 'coverage_tests'));
    await page.goto(server.address);
    await closePage(page);
}

module.exports = {
    description: 'Collect code coverage information',
    resources: [],
    run,
};
