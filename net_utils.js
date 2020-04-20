const assert = require('assert');
const http = require('http');
const https = require('https');
const node_fetch = require('node-fetch');

const {makeCurlCommand} = require('./curl_command');
const output = require('./output');
const {readFile} = require('./utils');

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
 * @param {Object?} init fetch options, see [`RequestInit` in the Fetch Spec](https://fetch.spec.whatwg.org/#requestinit).
 */
async function fetch(config, url, init) {
    if (!init) init = {};
    if (!init.redirect) init.redirect = 'manual';

    if (!init.agent) {
        const agentinit = {
            keepAlive: true,
        };
        if (/^https:\/\//.test(url)) {
            agentinit.rejectUnauthorized = (
                (config.rejectUnauthorized === undefined) ? true : config.rejectUnauthorized);
            init.agent = new https.Agent(agentinit);
        } else {
            init.agent = new http.Agent(agentinit);
        }
    }

    if (! init.headers) {
        init.headers = {};
    }
    if (! Object.keys(init.headers).find(h => h.toLowerCase() === 'user-agent')) {
        init.headers['User-Agent'] = 'pentf integration test (https://github.com/boxine/pentf)';
    }

    if (config.print_curl) {
        output.log(config, await makeCurlCommand(init, url));
    }

    return await node_fetch(url, init);
}

async function setupTLSClientAuth(fetchOptions, keyFilename, certFilename, rejectUnauthorized=false) {
    assert.equal(typeof fetchOptions, 'object');
    const agentOptions = {
        rejectUnauthorized,
        keepAlive: true,
    };
    agentOptions.key = await readFile(keyFilename, 'binary');
    agentOptions.cert = await readFile(certFilename, 'binary');
    fetchOptions.agent = new https.Agent(agentOptions);
    if (!fetchOptions.curl_extra_options) {
        fetchOptions.curl_extra_options = [];
    }
    fetchOptions.curl_extra_options.push(... [
        '--key', keyFilename,
        '--cert', certFilename,
    ]);
}

module.exports = {
    fetch,
    setupTLSClientAuth,
};
