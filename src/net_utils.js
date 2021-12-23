const assert = require('assert').strict;
const http = require('http');
const https = require('https');
const node_fetch = require('node-fetch');
const tough = require('tough-cookie');
const { URL } = require('url');
const fs = require('fs');

const { makeCurlCommand } = require('./curl_command');
const output = require('./output');

/**
 * fetch a URL.
 * Apart from the first parameter, this implements the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API).
 * (Using this method rather than another enables outputting of curl commands with `-c` and a couple of defaults suitable for pentf).
 *
 * @example
 * ```javascript
 * const response = await fetch(config, 'https://example.org/json-api', {
 *     method: 'POST',
 *     headers: {
 *         'Content-Type': 'application/json',
 *     },
 *     body: JSON.stringify({
 *         key: 'value',
 *     }),
 * });
 * assert.strictEqual(response.status, 200);
 * const data = await response.json();
 * ```
 * @param {*} config The pentf configuration object.
 * @param {string} url URL to fetch.
 * @param {RequestInit & { agent?: any, curl_include_headers?: boolean, curl_extra_options?: any, cookieJar?: any}} [init] fetch options, see [`RequestInit` in the Fetch Spec](https://fetch.spec.whatwg.org/#requestinit).
 * On top of the standard Fetch parameters, we support the following nonstandard parameters:
 * - `agent`: node [HTTP/HTTPS agent](https://nodejs.org/api/https.html#https_class_https_agent)
 * - `curl_include_headers`: boolean (default false) of whether to include `-k` in the curl output.
 * - `curl_extra_options`: List of extra options for the curl output.
 * - `cookieJar`: A [CookieJar object](https://github.com/salesforce/tough-cookie/blob/master/README.md#cookiejar) to use.
 *               Pass in the string `'create'` to create a new one (returned as `response.cookieJar`).
 *               The response will have a utility function `async getCookieValue(name)` to quickly retrieve a cookie value from the jar.
 */
async function fetch(config, url, init) {
    assert(url, 'url parameter is required');
    assert.equal(typeof url, 'string', 'url parameter must be a string');
    if (!init) init = {};
    if (!init._redirectChain && init.agent) {
        init._agentIsForced = true;
    }
    const redirect = init._redirect || init.redirect || 'manual';
    init = { ...init }; // make sure we don't change the object directly
    init._redirect = redirect;
    init.redirect = 'manual';

    const needAgent =
        !init._agentIsForced &&
        (!init.agent ||
            url.startsWith('http://') !== init.agent instanceof http.Agent);
    if (needAgent) {
        const agentinit = {
            keepAlive: true,
            timeout: 60000, // 60s
        };
        if (url.startsWith('https://')) {
            agentinit.rejectUnauthorized =
                config.rejectUnauthorized === undefined
                    ? true
                    : config.rejectUnauthorized;
            init.agent = new https.Agent(agentinit);
        } else {
            init.agent = new http.Agent(agentinit);
        }
    }

    if (!init.headers) {
        init.headers = {};
    }
    if (init.cookieJar && init.cookieJar !== 'create') {
        init.headers.Cookie = await init.cookieJar.getCookieString(url);
    }
    if (
        !Object.keys(init.headers).find(h => h.toLowerCase() === 'user-agent')
    ) {
        init.headers['User-Agent'] =
            'pentf e2etest (https://github.com/boxine/pentf)';
    }

    if (config.print_curl) {
        output.log(config, await makeCurlCommand(init, url));
    }

    const response = await node_fetch(url, init);

    let { cookieJar } = init;
    if (cookieJar) {
        if (cookieJar === 'create') {
            cookieJar = new tough.CookieJar();
        }

        const setCookie = response.headers.raw()['set-cookie'];
        if (Array.isArray(setCookie)) {
            await Promise.all(setCookie.map(c => cookieJar.setCookie(c, url)));
        } else {
            assert(!setCookie); // No Set-Cookie header
        }
        response.cookieJar = cookieJar;
        response.getCookieValue = async function getCookieValue(name) {
            const cookies = await response.cookieJar.getCookies(url);
            const cookie = cookies.find(c => c.key === name);
            return cookie ? cookie.value : undefined;
        };
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (redirect === 'follow') {
            if (!init._redirectChain) init._redirectChain = [];
            init._redirectChain.push(url);
            if (init._redirectChain.length > 5) {
                throw new Error(
                    `Too many redirects: ${init._redirectChain.join(' -> ')}`
                );
            }
            init.cookieJar = response.cookieJar;

            const next = response.headers.get('location');
            assert(next, `HTTP ${response.status} without Location header`);
            const nextURL = new URL(next, url).href;
            assert(
                /^(data:|https?:)/.test(nextURL),
                `Invalid redirect URL ${nextURL}`
            );

            if ([301, 302, 303].includes(response.status)) {
                init.method = 'GET';
                delete init.body;
            }

            if (!init._agentIsForced) {
                delete init.agent;
            }

            const res = await fetch(config, next, init);
            if (!res.redirectChain) res.redirectChain = init._redirectChain;
            return res;
        } else if (redirect !== 'manual') {
            throw new Error(`Unsupported redirect implementation ${redirect}`);
        }
    }

    return response;
}

/**
 * Modify fetch options for a request authenticated with a client-side TLS certificate.
 *
 * @example
 * ```javascript
 * const init = {method: 'POST', body: '{"something": "secret"}'};
 * await setupTLSClientAuth(init, 'key.pem', 'cert.crt');
 * const response = await fetch(config, 'https://protected.example.org/', init);
 * assert.equal(response.status, 200); // 401 = invalid certificate
 * ```
 * @param {Object} fetchOptions The fetch request option object to modify. (`init` parameter in [[fetch]] above)
 * @param {string} keyFilename Name of the private key file in PEM format (e.g. beginning with `-----BEGIN RSA PRIVATE KEY-----`)
 * @param {string} certFilename Name of the certificate file in PEM format (beginning with `-----BEGIN CERTIFICATE-----`)
 * @param {boolean} rejectUnauthorized to validate the server's certificate, false (=default) to accept invalid certificates as well.
 */
async function setupTLSClientAuth(
    fetchOptions,
    keyFilename,
    certFilename,
    rejectUnauthorized = false
) {
    assert.equal(typeof fetchOptions, 'object');
    const agentOptions = {
        rejectUnauthorized,
        keepAlive: true,
    };
    agentOptions.key = await fs.promises.readFile(keyFilename, 'binary');
    agentOptions.cert = await fs.promises.readFile(certFilename, 'binary');
    fetchOptions.agent = new https.Agent(agentOptions);
    if (!fetchOptions.curl_extra_options) {
        fetchOptions.curl_extra_options = [];
    }
    fetchOptions.curl_extra_options.push(
        ...['--key', keyFilename, '--cert', certFilename]
    );
}

module.exports = {
    fetch,
    setupTLSClientAuth,
};
