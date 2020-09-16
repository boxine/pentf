const assert = require('assert').strict;
const {newPage} = require('../browser_utils');
const runner = require('../runner');

async function run(config) {
    let page;
    const tasks = [
        {
            name: 'foo',
            async run(config) {
                page = await newPage(config);
            },
        },
    ];

    await runner.run(
        {
            ...config,
            quiet: true,
            logFunc: () => null,
        },
        tasks
    );

    assert(page.isClosed(), "Page wasn't closed during teardown");
}

module.exports = {
    description: 'Close browser automatically on teardown',
    run,
};
