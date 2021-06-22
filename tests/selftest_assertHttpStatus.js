const assert = require('assert').strict;
const http = require('http');

const { assertHttpStatus } = require('../src/assert_utils');
const { fetch } = require('../src/net_utils');

async function run(config) {
    const server = http.createServer((request, response) => {
        response.statusCode = parseInt(request.url.replace('/', '')) || 400;
        response.end(`{"error": "HTTP ${response.statusCode}"}`);
    });
    const port = await new Promise((resolve, reject) => {
        server.listen(0, err => {
            if (err) return reject(err);

            const { port } = server.address();
            return resolve(port);
        });
    });
    const baseUrl = `http://localhost:${port}/`;

    await assertHttpStatus(await fetch(config, baseUrl + '200'));
    const response = await assertHttpStatus(
        fetch(config, baseUrl + '404'),
        404
    );
    assert.equal(await response.text(), '{"error": "HTTP 404"}');

    await assert.rejects(
        async () =>
            await assertHttpStatus(await fetch(config, baseUrl + '409')),
        {
            message:
                `Expected request to ${baseUrl}409 to return HTTP 200, but it returned HTTP 409.` +
                ' HTTP body: {"error": "HTTP 409"}',
        }
    );
    await assert.rejects(
        async () =>
            await assertHttpStatus(fetch(config, baseUrl + '403'), 201, {
                message: 'Creation failed',
            }),
        {
            message:
                'Creation failed: ' +
                `Expected request to ${baseUrl}403 to return HTTP 201, but it returned HTTP 403.` +
                ' HTTP body: {"error": "HTTP 403"}',
        }
    );
}

module.exports = {
    description: 'assert_utils.assertHttpStatus',
    resources: [],
    run,
};
