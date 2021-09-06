const assert = require('assert').strict;
const path = require('path');
const fs = require('fs').promises;
const child_process = require('child_process');
const { assertGreater } = require('../src/assert_utils');

async function run() {
    const sub_run = path.join(__dirname, 'video', 'run');
    const { stdout } = await new Promise((resolve, reject) => {
        child_process.execFile(
            process.execPath,
            [sub_run, '--exit-zero', '--no-screenshots', '-v', '--video'],
            { cwd: path.dirname(sub_run) },
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({ stdout, stderr });
            }
        );
    });

    /** @type {string[]} */
    const videos = Array.from(stdout.matchAll(/Recording\svideo:\s(.*?)\s\[/gm))
        .map(match => match[1])
        .sort();

    const isFile = f =>
        fs
            .lstat(f)
            .then(f => f.isFile())
            .catch(() => false);

    try {
        assert(await isFile(videos[0]), `${videos[0]} is not a file`);
        assert(
            !(await isFile(videos[1])),
            `${videos[1]} is a file, but the test succeded`
        );

        // Check that the file has some frames
        const size = await (await fs.lstat(videos[0])).size;
        assertGreater(size, 5000);
    } catch (err) {
        console.log(stdout);
        throw err;
    }
}

module.exports = {
    description: 'record a video of browser page',
    run,
};
