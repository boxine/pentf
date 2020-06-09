const assert = require('assert').strict;
const http = require('http');
const querystring = require('querystring');

const {fetch} = require('../net_utils');

function escapeHTML(s) {
    // from https://stackoverflow.com/a/20403618/35070
    return (s
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;'));
}

// NOT part of the official API, this is parsing cookies on the server side.
// This is somewhat simplified and not a fully-fledged cookie parser
function parseRequestCookies(request) {
    request.cookies = {};

    (request.headers.cookie || '').split(';').forEach(cookieStr => {
        const [key, value] = cookieStr.trim().split('=', 2);
        request.cookies[key] = value;
    });
}

function handleRequest(request, response) {
    parseRequestCookies(request);

    const redirectMatch = /^\/(3[0-9]{2})redirect([0-9]+)$/.exec(request.url);
    if (redirectMatch) {
        const httpCode = parseInt(redirectMatch[1]);
        const redirectCount = parseInt(request.cookies.redirectCount || 0);
        const redirectNum = parseInt(redirectMatch[2]);
        const location = (redirectNum > 1) ? `/${httpCode}redirect${redirectNum - 1}` : '/end';
        response.writeHead(httpCode, {
            location,
            'Set-Cookie': `redirectCount=${redirectCount + 1}`,
        });
        response.end('redirected');
        return;
    }

    if (!['/', '/end'].includes(request.url)) {
        response.writeHead(404, {});
        response.end('404 Not Found');
        return;
    }

    if (request.method === 'POST') {
        // Parsing from https://stackoverflow.com/a/4310087/35070
        let body = '';
        request.on('data', data => {
            body += data;
            if (body.length > 1e6) request.connection.destroy();
        });
        request.on('end', function () {
            const {name} = querystring.parse(body);

            if (!name || !/^[-_a-zA-Z0-9_\s,;.]+$/.test(name)) {
                response.writeHead(400);
                response.end('Cannot parse POST');
                return;
            }

            response.writeHead(302, {
                'Location': '/',
                'Set-Cookie': `name=${name}`,
            });
            response.end('302');
        });
        return;
    }

    const visitCount = request.cookies.visitCount ? parseInt(request.cookies.visitCount) : 0;
    const setCookies = [
        `previousVisit=${new Date().toString()}; SameSite=Lax`,
        `visitCount=${visitCount + 1}`,
    ];

    response.writeHead(200, {
        'Content-Type': 'text/html',
        'Set-Cookie': setCookies,
    });
    response.end(`<!DOCTYPE html><html><body>
        <h1>Hello ${escapeHTML(request.cookies.name || 'anonymous')}!</h1>
        Previous visit: ${escapeHTML(request.cookies.previousVisit || 'never')}
        Visit count: ${escapeHTML('' + request.cookies.visitCount)}
        <form method="post">
        <input name="name" />
        <button type="submit">Set my name</button>
        </form>
        </body></html>`);
}

async function run(config) {
    const clientSockets = new Map();
    let socketCounter = 0;
    const server = http.createServer(handleRequest);
    server.on('connection', socket => {
        const socketId = socketCounter++;
        clientSockets.set(socketId, socket);
        socket.on('close', function () {
            clientSockets.delete(socketId);
        });
    });
    const port = await new Promise((resolve, reject) => {
        server.listen(0, (err) => {
            if (err) return reject(err);

            const {port} = server.address();
            return resolve(port);
        });
    });
    const url = `http://localhost:${port}/`;

    let response = await fetch(config, url, {cookieJar: 'create'});
    assert.equal(response.status, 200);
    assert.equal(await response.getCookieValue('visitCount'), '1');
    const cookieJar = response.cookieJar;

    response = await fetch(config, url, {cookieJar});
    assert.equal(response.status, 200);
    assert.equal(await response.getCookieValue('visitCount'), '2');

    response = await fetch(config, url, {
        cookieJar,
        method: 'POST',
        body: `name=${encodeURIComponent('John Smith')}`,
        redirect: 'manual',
    });
    assert.equal(response.status, 302);
    assert.equal(await response.getCookieValue('visitCount'), '2');
    assert.equal(await response.getCookieValue('name'), 'John Smith');

    response = await fetch(config, url, {cookieJar});
    assert.equal(response.status, 200);
    let html = (await response.text());
    assert(html.includes('Hello John Smith'));
    assert(html.includes('Visit count: 2'));
    assert.equal(await response.getCookieValue('name'), 'John Smith');
    assert.equal(await response.getCookieValue('visitCount'), '3');

    // Follow redirect automatically
    response = await fetch(config, url, {
        cookieJar,
        method: 'POST',
        body: `name=${encodeURIComponent('Jane Johnson')}`,
        redirect: 'follow',
    });
    assert.equal(response.status, 200);
    html = (await response.text());
    assert(html.includes('Hello Jane Johnson'));
    assert.equal(await response.getCookieValue('name'), 'Jane Johnson');
    assert.equal(await response.getCookieValue('visitCount'), '4');

    // Follow 307 redirects
    response = await fetch(config, url + '307redirect3', {
        cookieJar,
        method: 'POST',
        body: `name=${encodeURIComponent('Aaron Aaberg')}`,
        redirect: 'follow',
    });
    assert.equal(response.status, 200);
    html = (await response.text());
    assert(html.includes('Hello Aaron Aaberg'));
    assert.equal(await response.getCookieValue('name'), 'Aaron Aaberg');
    assert.equal(await response.getCookieValue('redirectCount'), '3');

    // Downgrade for 302 redirects, no POST to final URL
    response = await fetch(config, url + '302redirect4', {
        cookieJar,
        method: 'POST',
        body: `name=${encodeURIComponent('Xenia Xenomorph')}`,
        redirect: 'follow',
    });
    assert.equal(response.status, 200);
    html = (await response.text());
    assert(html.includes('Hello Aaron Aaberg'));
    assert.equal(await response.getCookieValue('name'), 'Aaron Aaberg');
    assert.equal(await response.getCookieValue('redirectCount'), '7');

    // Abort if loop is too long
    await assert.rejects(
        fetch(config, url + '302redirect40', {redirect: 'follow'}),
        err => {
            return err.message.startsWith('Too many redirects:');
        });

    // Terminate server
    server.close(); // No new connections
    for (const socket of clientSockets.values()) {
        socket.destroy();
    }
}

module.exports = {
    description: 'net_utils.fetch, namely cookie handling',
    run,
};
