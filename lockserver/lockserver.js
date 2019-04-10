#!/usr/bin/env node

const argparse = require('argparse');
const assert = require('assert');
const http = require('http');
const he = require('he');

const {readJSONBody, requestError} = require('./server_utils');

const MAX_EXPIRE_IN = 60000;

function listNamespaces(namespaces, request, response) {
    response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
    });

    const namespaceList = namespaces.keys().map(nskey => {
        return `<li><a href="${he.encode(nskey)}">${he.encode(nskey)}</a></li>`;
    }).join('\n');
    response.end(`<!DOCTYPE html>
<html>
<head><title>pintf lockserver</title></head>
<body>
<p>This is the <a href="https://github.com/boxine/pintf">pintf</a> lockserver demo.</p>

Available namespaces:

<ul>
${namespaceList}
</ul>

</body></html>`);
}

function listLocks(locks, request, response) {
    const now = Date.now();

    const res = [];
    for (const [resource, data] of locks) {
        const expireIn = data.expireAt - now;
        if (expireIn <= 0) continue;
        assert(data.client);

        res.push({
            resource,
            expireIn,
            client: data.client,
        });
    }

    response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(res));
}

async function acquireLocks(locks, request, response) {
    const data = await readJSONBody(request, response);
    if (!data) return;

    if (typeof data.client !== 'string') {
        return requestError(response, 'client is not a string');
    }
    if (!data.client) {
        return requestError(response, 'client is empty');
    }
    if (data.client.length > 100) {
        return requestError(response, 'client is too long');
    }
    if (! Array.isArray(data.resources)) {
        return requestError(response, 'resources is not an array');
    }
    if (! data.resources.every(r => typeof r === 'string')) {
        return requestError(response, 'not all resources are strings');
    }
    if (! data.resources.every(r => r)) {
        return requestError(response, 'not all resources are non-empty');
    }
    if (! data.resources.every(r => r.length < 256)) {
        return requestError(response, 'not all resources are < 256 chars long');
    }
    if (!Number.isInteger(data.expireIn)) {
        return requestError(response, 'expireIn is not an integer');
    }
    if (data.expireIn <= 0) {
        return requestError(response, 'expireIn is too small');
    }
    if (data.expireIn > MAX_EXPIRE_IN) {
        return requestError(response, 'expireIn is too large');
    }

    // Actually lock
    const now = Date.now();
    const {client, resources, expireIn} = data;

    // First, check that we can lock
    for (const r of resources) {
        const e = locks.get(r);
        if (!e) continue; // Great, not set yet
        if (e.expireAt <= now) continue; // Expired

        if (e.client !== client) {
            response.writeHead(409, {
                'Content-Type': 'application/json; charset=utf-8',
            });
            response.end(JSON.stringify({
                firstResource: r,
                client: e.client,
                expireIn: (e.expireAt - now),
            }));
            return;
        }
    }

    // Actually set locks
    const expireAt = now + expireIn;
    for (const r of resources) {
        locks.set(r, {
            client,
            expireAt,
        });
    }

    response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify({}));
}

async function releaseLocks(locks, request, response) {
    const data = await readJSONBody(request, response);
    if (!data) return;

    if (typeof data.client !== 'string') {
        return requestError(response, 'client is not a string');
    }
    if (!data.client) {
        return requestError(response, 'client is empty');
    }
    if (data.client.length > 100) {
        return requestError(response, 'client is too long');
    }
    if (! Array.isArray(data.resources)) {
        return requestError(response, 'resources is not an array');
    }
    if (! data.resources.every(r => typeof r === 'string')) {
        return requestError(response, 'not all resources are strings');
    }
    if (! data.resources.every(r => r)) {
        return requestError(response, 'not all resources are non-empty');
    }
    if (! data.resources.every(r => r.length < 256)) {
        return requestError(response, 'not all resources are < 256 chars long');
    }

    const now = Date.now();
    const {client, resources} = data;

    // First, check that we can release all
    for (const r of resources) {
        const e = locks.get(r);
        if (!e) continue; // Deleted already
        if (e.expireAt <= now) continue; // Expired

        if (e.client !== client) {
            response.writeHead(409, {
                'Content-Type': 'application/json; charset=utf-8',
            });
            response.end(JSON.stringify({
                firstResource: r,
                client: e.client,
                expireIn: (e.expireAt - now),
            }));
            return;
        }
    }

    // Actually release locks
    for (const r of resources) {
        locks.delete(r);
    }

    response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify({}));
}

function handleRequest(request, response) {
    const {namespaces} = request.socket.server;
    assert(namespaces);

    if (request.url === '/' && request.method === 'GET') {
        return listNamespaces(namespaces, request, response);
    }
    const m = /\/([-_0-9a-zA-F]+)$/.exec(request.url);
    if (m) {
        const namespaceName = m[1];
        let namespace = namespaces.get(namespaceName);
        if (! namespace) {
            namespace = new Map();
            namespaces.set(namespaceName, namespace);
        }

        if (request.method === 'GET') {
            return listLocks(namespace, request, response);
        } else if (request.method === 'POST') {
            return acquireLocks(namespace, request, response);
        } else if (request.method === 'DELETE') {
            return releaseLocks(namespace, request, response);
        } else {
            response.writeHead(405, {
                'Content-Type': 'text/plain',
            });
            response.end(`405 Method not allowed: ${request.method}`);
            return;
        }
    }

    response.writeHead(404, {
        'Content-Type': 'text/plain',
    });
    response.end('404 Not Found');
}

async function lockserver(options) {
    const server = http.createServer(handleRequest);
    server.namespaces = new Map();
    
    return new Promise((resolve, reject) => {
        server.listen(options.port, (err) => {
            if (err) return reject(err);

            const {port} = server.address();
            return resolve({
                server,
                port,
            });
        });
    });
}

async function beforeAllTests(config) {
    if (! config.pintf_boot_lockserver) {
        return;
    }

    const serverData = await lockserver({port: 0});
    config.pintf_lockserver_url = `http://localhost:${serverData.port}/`;
    return serverData;
}

async function afterAllTests(config, serverData) {
    if (!serverData) { // Nothing configured
        assert(! config.pintf_boot_lockserver);
        return;
    }

    await new Promise((resolve, reject) => {
        serverData.server.close(err => {
            if (err) return reject(err);
            return resolve();
        });
    });
}

async function main() {
    const parser = new argparse.ArgumentParser();
    parser.addArgument(['-p', '--port'], {
        metavar: 'PORT',
        help: 'Port to use. 0 for random (default: %(defaultValue)s)',
        defaultValue: 1524,
        type: 'int',
    });
    const args = parser.parseArgs();

    const {port} = await lockserver(args);
    if (!args.port) {
        console.log(`Running on http://localhost:${port}/`); // eslint-disable-line no-console
    }
}

if (require.main === module) {
    (async () => {
        try {
            await main();
        } catch (e) {
            console.error(e.stack); // eslint-disable-line no-console
            process.exit(2);
        }
    })();
}

module.exports = {
    beforeAllTests,
    afterAllTests,
};
