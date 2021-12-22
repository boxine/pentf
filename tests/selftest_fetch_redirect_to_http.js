const assert = require('assert').strict;
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const { fetch } = require('../src/net_utils');

const TLS_FILES_DIR = path.join(__dirname, 'fetch_redirect_to_http');

async function setupServer(createServer, name, redirects) {
    const server = createServer((request, response) => {
        const redirectTarget = redirects[request.url];
        if (redirectTarget !== undefined) {
            response.writeHead(302, {
                'Content-Type': 'text/plain',
                Location: redirectTarget,
            });
            response.end(`Redirect from ${name} server to ${redirectTarget}`);
            return;
        }

        response.writeHead(200, {
            'Content-Type': 'text/plain',
        });
        response.end(`${name} server answering ${request.url}`);
    });
    await new Promise((resolve, reject) => {
        server.listen(0, err => {
            if (err) return reject(err);
            resolve();
        });
    });
    return server;
}

async function run(config) {
    const redirectMap = {};
    const httpServer = await setupServer(
        http.createServer,
        'HTTP',
        redirectMap
    );
    const httpAddress = `http://localhost:${httpServer.address().port}/`;
    redirectMap['/to-http'] = httpAddress + 'redirected';

    const keyFile = path.join(TLS_FILES_DIR, 'key.pem');
    const key = await fs.promises.readFile(keyFile);
    const certFile = path.join(TLS_FILES_DIR, 'cert.pem');
    const cert = await fs.promises.readFile(certFile);

    const secureServer = await setupServer(
        handler => https.createServer({ key, cert }, handler),
        'Secure',
        redirectMap
    );
    const secureAddress = `https://localhost:${secureServer.address().port}/`;
    redirectMap['/to-secure'] = secureAddress + 'redirected';

    // Follow redirect from HTTPS to HTTP
    const httpResponse = await fetch(config, secureAddress + 'to-http', {
        redirect: 'follow',
    });
    await assert.equal(httpResponse.status, 200);
    const httpText = await httpResponse.text();
    assert.equal(httpText, 'HTTP server answering /redirected');

    // Follow redirect from HTTPS to HTTP
    const secureResponse = await fetch(config, secureAddress + 'to-secure', {
        redirect: 'follow',
    });
    await assert.equal(secureResponse.status, 200);
    const secureText = await secureResponse.text();
    assert.equal(secureText, 'Secure server answering /redirected');

    // Terminate server
    httpServer.close(); // No new connections
    secureServer.close(); // No new connections
}

module.exports = {
    description: 'Redirects from https:// to http:// with net_utils.fetch',
    run,
};
