const http = require('http');
const assert = require('assert').strict;
const {URL} = require('url');
const fs = require('fs').promises;
const path = require('path');
const output = require('../../output');

/**
 * Launch a static file server for tests
 * @param {*} config
 * @param {string} rootDir Root directory to server files from
 */
async function launchServer(config, rootDir) {
    assert.equal(typeof config, 'object', 'Missing config paramter');
    assert(rootDir, 'object', 'Missing rootDir parameter');

    let address;

    const server = http.createServer(async (req, res) => {
        output.logVerbose(config, `${req.method} ${req.url}`);

        const url = new URL(req.url, address);
        let file = path.normalize(path.join(rootDir, url.pathname));

        const ext = path.parse(file).ext || '.html';
        const map = {
            '.ico': 'image/x-icon',
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.json': 'application/json',
            '.css': 'text/css',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
        };

        if (!file.startsWith(rootDir)) {
            res.statusCode = 404;
            res.end(`File ${file} not found!`);
            return;
        }

        try {
            // if is a directory search for index file matching the extention
            const stat = await (fs.stat(file));
            if (stat.isDirectory()) {
                file += '/index' + ext;
            }

            const data = await fs.readFile(file);
            res.setHeader('Content-type', map[ext] || 'text/plain');
            res.end(data);
        } catch (err) {
            res.statusCode = 404;
            res.end(`File ${file} not found!`);
        }
    });

    address = await new Promise(resolve => {
        server.listen(0, () => {
            resolve(`http://localhost:${server.address().port}`);
        });
    });

    return {
        address,
        close: () => new Promise(resolve => server.close(resolve)),
    };
}

module.exports = {
    launchServer,
};
