const assert = require('assert').strict;
const path = require('path');
const fs = require('fs');
const { PNG } = require('pngjs');
const mkdirpCb = require('mkdirp');
const rimrafCb = require('rimraf');
const { promisify } = require('util');
const mkdirp = promisify(mkdirpCb);
const rimraf = promisify(rimrafCb);

const { newPage, assertSnapshot } = require('../src/browser_utils');

async function run(config) {
    const dir = path.join(__dirname, 'snapshot_test_viewport', 'snapshots');
    config = { ...config, snapshot_directory: dir };

    // Clean before running tests
    await rimraf(dir);
    await mkdirp(dir);

    const page = await newPage(config);
    await page.setContent('<h1 style="font-size: 64px">Hello world!</h1>');
    await page.setViewport({
        height: 180,
        width: 320,
    });
    await assertSnapshot(config, page, '1', { fullPage: false });

    const buf = await fs.promises.readFile(
        path.join(dir, `${config._taskName}_1-expected.png`)
    );
    const img = PNG.sync.read(buf);

    assert.equal(img.width, 320);
    assert.equal(img.height, 180);
}

module.exports = {
    description: 'Compare snapshots with a specific viewport',
    run,
};
