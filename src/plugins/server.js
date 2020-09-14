const path = require('path');
const child_process = require('child_process');

function createServer() {
    /** @type {ChildProcessWithoutNullStreams} */
    let child;
    return {
        name: 'pentf-server',
        async onStart(config) {
            const binPath = await new Promise((resolve, reject) => {
                child_process.exec('npm', [], (err, stdout) => {
                    return err ? reject(err) : resolve(stdout);
                });
            });

            const wmr = path.join(binPath, 'wmr');
            child = child_process.spawn(wmr);

            child.on('data', data => {
                console.log(data.toString());
            });

            // TODO: Read server url
            config.pentfServerUrl = 'https://example.com';
        },
        async onLoad(config, files) {
            // TODO
        },
        async onShutdown() {
            child.kill();
        }
    };
}

module.exports = {
    createServer,
};
