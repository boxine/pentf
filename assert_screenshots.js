const fs = require('fs');
const {PNG} = require('pngjs');
const pixelmatch = require('pixelmatch');
const mkdirpCb = require('mkdirp');
const {promisify} = require('util');
const path = require('path');
const assert = require('assert');

const mkdirp = promisify(mkdirpCb);

/**
 * Create an image showing the difference between image A and B.
 * @param {import('pngjs').PNGWithMetadata} a 
 * @param {import('pngjs').PNGWithMetadata} b 
 * @returns {{diff_image: import('pngjs').PNG, diff_pixel_count: number}}
 */
function create_diff_image(a, b) {
    // Get max dimensions
    const width = Math.max(a.width, b.width);
    const height = Math.max(a.height, b.height);

    const diff = new PNG({width, height});
    const diff_pixel_count = pixelmatch(
        a.data,
        b.data,
        diff.data,
        width,
        height,
        {threshold: 0.1}
    );

    return {
        diff_image: diff,
        diff_pixel_count
    };
}

/**
 * Take a screenshot of the current page and compare it with the
 * previous one if any exists.
 * @param {import('puppeteer').Page} page 
 * @param {*} config 
 * @param {string} name 
 */
async function assert_screenshot(page, config, name) {
    assert(name);

    await mkdirp(config.screenshot_directory);

    const actual = path.join(
        config.screenshot_directory,
        `${config.task_name}-${name}-actual.png`
    );
    const expected = path.join(
        config.screenshot_directory,
        `${config.task_name}-${name}-expected.png`
    );

    const has_expected = fs.existsSync(expected);

    await page.screenshot({
        fullPage: true,
        type: 'png',
        // If no previous screenshot exist we can treat the current
        // one as the expected screenshot for future assertions.
        path: has_expected ? actual : expected,
    });

    // No point in making comparisons when there is nothing to
    // compare the screenshot to.
    if (has_expected) {
        const {diff_image, diff_pixel_count} = create_diff_image(
            PNG.sync.read(fs.readFileSync(expected)),
            PNG.sync.read(fs.readFileSync(actual)),
        );
        
        if (diff_pixel_count > 0) {
            const diff_file = path.join(
                config.screenshot_directory,
                `${config.task_name}-${name}-diff.png`
            );
            fs.writeFileSync(diff_file, PNG.sync.write(diff_image));
            
            throw new Error(`Screenshots do not match. See: ${diff_file}`);
        }
    }
}

module.exports = {
    assert_screenshot,
};
