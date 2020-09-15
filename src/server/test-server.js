const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const WebSocket = require('ws');
const { Readable } = require('stream');

async function getPort() {
    return await new Promise((resolve, reject) => {
        const server = http.createServer(() => null);
        server.listen(0, (err) => {
            if (err) return reject(err);
            const {port} = server.address();
            server.close();
            return resolve(port);
        });
    });
}

/**
 *
 * @param {http.ServerResponse} res
 * @param {string} fileName
 * @param {string} [content]
 */
async function send(res, fileName, content) {
    res.writeHead(200, {
        'Content-Type': mime.lookup(fileName) || '',
        'Content-Length': content
            ? Buffer.from(content).byteLength :
            (await fs.promises.stat(fileName)).size
    });

    if (content) {
        const r = new Readable({read: () => {}});
        r.push(content);
        r.pipe(res);
    } else {
        fs.createReadStream(fileName).pipe(res);
    }
}

/**
 * @param {import('../config').Config} config
 */
async function createServer(config) {
    let address;
    let port;
    let wsAddress;
    let files = [];

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, address);
        if (url.pathname.startsWith('/base')) {
            const fileName = path.join(config.rootDir, url.pathname.replace('/base', ''));
            await send(res, fileName);
            return;
        } else if (url.pathname === '/run') {
            const fileName = path.join(__dirname, 'public', 'run.html');
            await send(res, fileName);
            return;
        } else if (url.pathname === '/') {
            const fileName = path.join(__dirname, 'public', 'index.html');
            await send(res, fileName);
            return;
        }

        // FIXME: Directory traversal attack
        const fileName = path.join(__dirname, 'public', url.pathname);
        try {
            await fs.promises.access(fileName);

            if (url.pathname === '/browser-runner.js') {
                let content = await fs.promises.readFile(fileName, 'utf-8');
                content = content
                    .replace(/var wsUrl = '';/, `var wsUrl = '${wsAddress}';`)
                    .replace(/var files = \[];/, `var files = [${files.map(x => `"${x}"`).join(', ')}];`);
                await send(res, fileName, content);
            } else {
                await send(res, fileName);
            }
        } catch(e) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/plain');
            res.end('404 - Not found');
        }
    });

    const wsPort = await getPort();
    const wss = new WebSocket.Server({ port: wsPort });
    wss.on('connection', function connection(ws) {
        ws.on('message', function incoming(message) {
            console.log('received: %s', message);
        });

        ws.send('something');
    });


    port = await new Promise((resolve, reject) => {
        server.listen(0, (err) => {
            if (err) return reject(err);
            const {port} = server.address();
            return resolve(port);
        });
    });

    address = `http://localhost:${port}`;
    wsAddress = `ws://localhost:${wsPort}`;

    return {
        server,
        wsServer: wss,
        wsUrl: wsAddress,
        setFiles(testCases) {
            files = testCases;
        },
        port,
        url: address,
    };
}

module.exports = {
    createServer,
};
