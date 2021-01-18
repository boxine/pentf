const assert = require('assert').strict;
const path = require('path');
const fs = require('fs');
const child_process = require('child_process');
const rimrafCb = require('rimraf');
const {promisify} = require('util');

const rimraf = promisify(rimrafCb);

async function run() {
    const fixture = path.join(__dirname, 'screenshot_popup_tests');

    const json_file = path.join(fixture, 'results.json');
    const screenshot_dir = path.join(fixture, 'screenshot_directory');

    await rimraf(json_file);
    await rimraf(screenshot_dir);

    const sub_run = path.join(fixture, 'run');
    await new Promise((resolve, reject) => {
        child_process.execFile(
            sub_run,
            ['--exit-zero', '--json', '-v'],
            { cwd: path.dirname(sub_run) },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    const json = JSON.parse(await fs.promises.readFile(json_file, 'utf-8'));
    const screenshots = json.tests[0].taskResults[0].error_screenshots;

    assert.equal(screenshots.length, 2);
    assert.equal(screenshots[0].type, 'Buffer');
    assert.equal(screenshots[1].type, 'Buffer');
}

module.exports = {
    description: 'Include screenshots of popups on error',
    run,
};
