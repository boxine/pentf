const {newPage} = require('../../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    page.setContent('<h1>Hello world</h1>');
    await page.waitForSelector('h2',{timeout: 500});
}

module.exports = {
    description: 'Force screenshot generation',
    run,
};
