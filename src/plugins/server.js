const path = require('path');
const fs = require('fs');
const child_process = require('child_process');
const { timeoutPromise } = require('../promise_utils');

function createServer() {
    const serverCwd = path.join(__dirname, '..', 'server');

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

            child = child_process.spawn(path.join(binPath, 'wmr'), ['--cwd', serverCwd]);

            let resolveInit;
            const initPromise = new Promise((resolve) => {
                resolveInit = resolve;
            });

            child.stdout.on('data', data => {
                const str = data.toString();
                console.log(str);

                const match = str.match(/Listening on (.*)/);
                if (match) {
                    config.pentfServerUrl = match[1];
                    resolveInit();
                }
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
            const scripts = files.map(file => {
                const relative = path.relative(config.rootDir, file);
                return `<script src="/base/${relative}"></script>`;
            }).join('\n');

            const template = path.join(serverCwd, 'run.template.html');
            let html = await fs.promises.readFile(template, 'utf-8');
            html = html.replace(/<!--\sSCRIPTS\s-->/, scripts);
            await fs.promises.writeFile(
                path.join(serverCwd, 'run.html'),
                html
            );
        },
        async onShutdown() {
            child.kill();
        }
    };
}

module.exports = {
    createServer,
};
