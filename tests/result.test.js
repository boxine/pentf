const assert = require('assert').strict;
const path = require('path');
const fs = require('fs');
const rimrafCb = require('rimraf');
const {promisify} = require('util');
const { execFile } = require('./helpers');

const rimraf = promisify(rimrafCb);

async function run() {
    const fixture = path.join(__dirname, 'screenshot_tests');

    const html_file = path.join(fixture, 'results.html');
    const md_file = path.join(fixture, 'results.md');
    const json_file = path.join(fixture, 'results.json');
    const screenshot_dir = path.join(fixture, 'screenshot_directory');

    await rimraf(html_file);
    await rimraf(md_file);
    await rimraf(json_file);
    await rimraf(screenshot_dir);

    await execFile(
        path.join(fixture, 'run'),
        ['--exit-zero', '--html', '--json', '--markdown', '--pdf'],
        { cwd: fixture },
    );

    const html = await fs.promises.readFile(html_file, 'utf-8');
    assert(
        /<img src="data:image\/png;base64/.test(html),
        'Could not find <img src="..." /> in html'
    );

    // Markdown file doesn't contain screenshot. Just make sure that it exists.
    await fs.promises.readFile(md_file, 'utf-8');

    const json = JSON.parse(await fs.promises.readFile(json_file, 'utf-8'));
    assert.equal(json.tests[0].taskResults[0].error_screenshots.length, 1);
}

module.exports = {
    description: 'Check that results are generated and contain screenshots',
    run,
};
