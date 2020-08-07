const assert = require('assert').strict;
const { newPage, workaround_setContent, assertNotSelector } = require('../browser_utils');

async function run(config) {
    const page = await newPage(config);
    await workaround_setContent(page, '<div></div>');

    await assertNotSelector(page, 'span', { timeout: 10 });

    try {
        await assertNotSelector(page, 'div', { timeout: 3000, message: 'foobar' });
        throw new Error('assertNotSelector did not throw');
    } catch (err) {
        // success
        assert(err.message.includes('foobar'), `Custom message "foobar" not found in "${err.message}"`);
    }
}

module.exports = {
    run,
    description: 'Assert that a selector is not present.'
};
