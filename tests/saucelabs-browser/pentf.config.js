const { createSaucelabsLauncher } = require('../../src/plugins/saucelabs');

module.exports = {
    plugins: [
        createSaucelabsLauncher({
            username: process.env.SAUCE_USERNAME,
            accessKey: process.env.SAUCE_ACCESS_KEY,
            browsers: [
                { name: 'chrome' }
            ]
        })
    ]
};
