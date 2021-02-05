const assert = require('assert').strict;
const path = require('path');
const mkdirpCb = require('mkdirp');
const rimrafCb = require('rimraf');
const {promisify} = require('util');
const mkdirp = promisify(mkdirpCb);
const rimraf = promisify(rimrafCb);

const {newPage, assertSnapshot} = require('../src/browser_utils');

async function run(config) {
    const dir = path.join(__dirname, 'snapshot_test_size_mismatch', 'snapshots');
    config = {...config, snapshot_directory: dir};

    // Clean before running tests
    await rimraf(dir);
    await mkdirp(dir);

    const page = await newPage(config);
    await page.setContent(`
        <body style="background: yellow">
            <h1 style="font-size: 64px">Hello world!</h1>
        </body>
    `);
    await page.setViewport({
        width: 800,
        height: 640,
    });
    await assertSnapshot(config, page, '1', { fullPage: false });

    await page.setViewport({
        width: 1024,
        height: 720,
    });

    // Should do the normal diff and only throw a normal screenshot
    // mismatch error
    await assert.rejects(
        () => assertSnapshot(config, page, '1', { fullPage: false }),
        /there were \d+ differences/
    );
}

module.exports = {
    description: 'Compare snapshots even if their sizes differs',
    run,
};
