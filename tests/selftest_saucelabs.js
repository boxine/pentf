const path = require('path');
const child_process = require('child_process');

async function run(config) {
    const sub_run = path.join(__dirname, 'saucelabs-browser', 'run');
    const {stderr, stdout} = await new Promise((resolve, reject) => {
        child_process.execFile(
            sub_run,
            ['--exit-zero', '--no-colors', '--no-screenshots', '--ci'],
            {
                wd: path.dirname(sub_run),
                env: {
                    SAUCE_USERNAME: process.env.SAUCE_USERNAME,
                    SAUCE_ACCESS_KEY: process.env.SAUCE_ACCESS_KEY
                }
            },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    console.log("ERR", stderr);
    console.log("OUT", stdout);
}

module.exports = {
    run,
    description: 'Run tests inside Saucelabs browser',
    skip: () => !process.env.SAUCE_USERNAME || !process.env.SAUCE_ACCESS_KEY
};
