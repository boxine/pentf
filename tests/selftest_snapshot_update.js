const path = require('path');
const mkdirpCb = require('mkdirp');
const rimrafCb = require('rimraf');
const {promisify} = require('util');
const mkdirp = promisify(mkdirpCb);
const rimraf = promisify(rimrafCb);

const {newPage, assertSnapshot} = require('../src/browser_utils');

async function run(config) {
    const dir = path.join(__dirname, 'snapshot_update_test', 'snapshots');
    config = {...config, snapshot_directory: dir, update_snapshots: true};

    // Clean before running tests
    await rimraf(dir);
    await mkdirp(dir);

    const page = await newPage(config);
    await page.setContent('<h1 style="font-size: 64px">Hello world!</h1>');
    await assertSnapshot(config, page, '1');

    await page.setContent('<h1 style="font-size: 32px">Hello world!</h1>');

    // Update existing snapshot
    await assertSnapshot(config, page, '1');
}

module.exports = {
    description: 'Update existing snapshots',
    run,
};
