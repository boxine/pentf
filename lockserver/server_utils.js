function readBody(request) {
    return new Promise((resolve, reject) => {
        let done = false;

        let body = '';
        request.on('data', data => {
            body += data;
        });
        request.on('end', () => {
            if(done) return;
            done = true;
            resolve(body);
        });
        request.on('error', e => {
            if(done) return;
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
    } catch(e) {
        requestError(response, 'Failed to read body');
        return false;
    }

    let res;
    try {
        res = JSON.parse(body);
    } catch(e) {
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
    response.writeHead(400, {'Content-Type': 'text/plain'});
    response.end(message);
}

module.exports = {
    readJSONBody,
    requestError,
};
