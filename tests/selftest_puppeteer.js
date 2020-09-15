const path = require('path');
const child_process = require('child_process');

async function run(config) {
    const sub_run = path.join(__dirname, 'puppeteer-browser', 'run');
    const {stderr, stdout} = await new Promise((resolve, reject) => {
        child_process.execFile(
            sub_run,
            ['--exit-zero', '--no-colors', '--no-screenshots', '--ci'],
            { cwd: path.dirname(sub_run) },
            (err, stdout, stderr) => {
                console.log(stdout)
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    console.log();
    console.log("ERR", stderr);
    console.log("OUT", stdout);
}

module.exports = {
    run,
    description: 'Run tests inside Puppeteer browser instance',
};
