const assert = require('assert').strict;
const {
    newPage,
    workaround_setContent,
    assertNotTestId,
} = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    await workaround_setContent(page, '<div data-testid="foobar"></div>');

    await assertNotTestId(page, 'bar', { timeout: 10 });

    try {
        await assertNotTestId(page, 'foobar', {
            timeout: 3000,
            message: 'foobar',
        });
        throw new Error('assertNotTestId did not throw');
    } catch (err) {
        // success
        assert(
            err.message.includes('foobar'),
            `Custom message "foobar" not found in "${err.message}"`
        );
    }
}

module.exports = {
    run,
    description: 'Assert that a Test ID is not present.',
};
