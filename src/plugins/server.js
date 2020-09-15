const path = require('path');
const child_process = require('child_process');
const { timeoutPromise } = require('../promise_utils');

function createServer() {
    /** @type {ChildProcessWithoutNullStreams} */
    let child;
    return {
        name: 'pentf-server',
        async onStart(config) {
            const binPath = await new Promise((resolve, reject) => {
                child_process.exec('npm bin wmr', (err, stdout) => {
                    return err ? reject(err) : resolve(stdout.replace(/\n/, ''));
                });
            });

            const serverCwd = path.join(__dirname, '..', 'server');
            child = child_process.spawn(path.join(binPath, 'wmr'), ['--cwd', serverCwd]);

            let resolveInit;
            const initPromise = new Promise((resolve) => {
                resolveInit = resolve;
            });

            child.stdout.on('data', data => {
                const str = data.toString();
                const match = str.match(/Listening on (.*)/);
                if (match) {
                    config.pentfServerUrl = match[1];
                    resolveInit();
                }

                console.log(data.toString());
            });
            child.stderr.on('data', data => {
                console.log(data.toString());
            });

            await timeoutPromise(
                config,
                initPromise,
                {message: 'Could not boot server'}
            );
        },
        async onLoad(config, files) {
            console.log("LOAD", files);
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
