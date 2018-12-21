const http = require('http');
const https = require('https');
const node_fetch = require('node-fetch');

const {make_curl_command} = require('./curl_command');
const output = require('./output');

async function fetch(config, url, options) {
    if (!options) options = {};
    if (!options.redirect) options.redirect = 'manual';

    if (!options.agent) {
        const agentOptions = {
            keepAlive: true,
        };
        if (/^https:\/\//.test(url)) {
            agentOptions.rejectUnauthorized = false;
            options.agent = new https.Agent(agentOptions);
        } else {
            options.agent = new http.Agent(agentOptions);
        }
    }

    if (config.print_curl) {
        output.log(config, await make_curl_command(options, url));
    }

    return await node_fetch(url, options);
}

module.exports = {
    fetch,
};
