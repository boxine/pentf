const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

/**
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} fileName
 */
async function send(req, res, fileName) {
    res.statusCode = 200;
    const stat = await fs.promises.stat(fileName);

    res.writeHead(200, {
        'Content-Type': mime.lookup(fileName) || '',
        'Content-Length': stat.size,
    });
    fs.createReadStream(fileName).pipe(res);
}

/**
 * @param {import('../config').Config} config
 */
async function createServer(config) {
    let address;
    let port;

    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, address);
        if (url.pathname.startsWith('/base')) {

        } else if (url.pathname === '/run') {
            const fileName = path.join(__dirname, 'public', 'run.html');
            await send(req, res, fileName);
            return;
        } else if (url.pathname === '/') {
            const fileName = path.join(__dirname, 'public', 'index.html');
            await send(req, res, fileName);
            return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Hello World');
    });

    port = await new Promise((resolve, reject) => {
        server.listen(0, (err) => {
            if (err) return reject(err);
            const {port} = server.address();
            return resolve(port);
        });
    });

    address = `http://localhost:${port}`;

    return {
        server,
        port,
        url: address,
    };
}

module.exports = {
    createServer,
};
