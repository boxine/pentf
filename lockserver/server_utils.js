const assert = require('assert').strict;

function readBody(request) {
    return new Promise((resolve, reject) => {
        let done = false;

        let body = '';
        request.on('data', data => {
            body += data;
        });
        request.on('end', () => {
            if (done) return;
            done = true;
            resolve(body);
        });
        request.on('error', e => {
            if (done) return;
            done = true;
            reject(e);
        });
    });
}

// Returns falsy if the input is not valid
async function readJSONBody(request, response) {
    let body;
    try {
        body = await readBody(request);
    } catch (e) {
        requestError(response, 'Failed to read body');
        return false;
    }

    let res;
    try {
        res = JSON.parse(body);
    } catch (e) {
        requestError(response, 'Failed to read body');
        return false;
    }

    if (!res) {
        requestError(response, 'Could not parse JSON');
        return false;
    }

    return res;
}

function requestError(response, message) {
    response.writeHead(400, { 'Content-Type': 'text/plain' });
    response.end(message);
}

function writeJSON(response, status, data) {
    assert(Number.isInteger(status));

    response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify(data, null, 2));
}

module.exports = {
    readJSONBody,
    requestError,
    writeJSON,
};
