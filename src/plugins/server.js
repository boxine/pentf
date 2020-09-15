const path = require('path');
const fs = require('fs');
const { wait } = require('../utils');
const { createServer } = require('../server/test-server');

function createServerPlugin() {
    const serverCwd = path.join(__dirname, '..', 'server', 'public');

    /** @type {{port: number, url: string, server: import('http').Server, wsServer: import("ws").Server, wsUrl: string}} */
    let instance;

    return {
        name: 'pentf-server',
        async onStart(config) {
            instance = await createServer(config);
            config.pentfServerUrl = instance.url;
        },
        async onLoad(config, files) {
            const scripts = files.map(file => {
                return '/base/'+ path.relative(config.rootDir, file);
            });
            instance.setFiles(scripts);
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
