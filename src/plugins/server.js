const path = require('path');
const fs = require('fs');
const { wait } = require('../utils');
const { createServer } = require('../server/test-server');

function createServerPlugin() {
    const serverCwd = path.join(__dirname, '..', 'server', 'public');

    /** @type {{port: number, url: string, server: import('http').Server}} */
    let instance;

    return {
        name: 'pentf-server',
        async onStart(config) {
            instance = await createServer();
            config.pentfServerUrl = instance.url;
        },
        async onLoad(config, files) {
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
            await wait(30000);
            await new Promise((resolve, reject) => {
                instance.server.close(err => err ? reject(err) : resolve());
            });
        }
    };
}

module.exports = {
    createServerPlugin,
};
