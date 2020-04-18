const assert = require('assert');
const http = require('http');
const https = require('https');
const node_fetch = require('node-fetch');

const {makeCurlCommand} = require('./curl_command');
const output = require('./output');
const {readFile} = require('./utils');


async function fetch(config, url, options) {
    if (!options) options = {};
    if (!options.redirect) options.redirect = 'manual';

    if (!options.agent) {
        const agentOptions = {
            keepAlive: true,
        };
        if (/^https:\/\//.test(url)) {
            agentOptions.rejectUnauthorized = (
                (config.rejectUnauthorized === undefined) ? true : config.rejectUnauthorized);
            options.agent = new https.Agent(agentOptions);
        } else {
            options.agent = new http.Agent(agentOptions);
        }
    }

    if (! options.headers) {
        options.headers = {};
    }
    if (! Object.keys(options.headers).find(h => h.toLowerCase() === 'user-agent')) {
        options.headers['User-Agent'] = 'pentf integration test (https://github.com/boxine/pentf)';
    }

    if (config.print_curl) {
        output.log(config, await makeCurlCommand(options, url));
    }

    return await node_fetch(url, options);
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
