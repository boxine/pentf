// Locking functions for communication with the lockserver

const assert = require('assert');

const {fetch} = require('./net_utils');


async function externalAcquire(config, resources, expireIn) {
    assert(config.external_locking_client);
    assert(config.external_locking_url);
    assert(Array.isArray(resources));
    assert(resources.every(r => typeof r === 'string'));
    assert(Number.isInteger(expireIn));

    const response = await fetch(config, config.external_locking_url, {
        method: 'POST',
        body: JSON.stringify({
            resources,
            expireIn,
            client: config.external_locking_client,
        }),
    });
    if (response.status === 409) {
        return await response.json();
    }

    if (response.status !== 200) {
        throw new Error(
            `Acquiry of ${resources.join(',')} at ${config.external_locking_url} ` +
            `failed with error code ${response.status}: ${await response.text()}`);
    }
    await response.json();
    return true;
}

async function externalRelease(config, resources) {
    assert(config.external_locking_client);
    assert(config.external_locking_url);
    assert(Array.isArray(resources));
    assert(resources.every(r => typeof r === 'string'));

    const response = await fetch(config, config.external_locking_url, {
        method: 'DELETE',
        body: JSON.stringify({
            resources,
            client: config.external_locking_client,
        }),
    });

    if (response.status === 409) {
        return await response.json();
    }

    if (response.status !== 200) {
        throw new Error(
            `Release of ${resources.join(',')} at ${config.external_locking_url} ` +
            `failed with error code ${response.status}: ${await response.text()}`);
    }
    await response.json();

    return true;
}

async function externalList(config) {
    assert(config.external_locking_client);
    assert(config.external_locking_url);

    const response = await fetch(config, config.external_locking_url, {
        method: 'GET',
    });

    assert.equal(
        response.status, 200,
        `Resource listing at ${config.external_locking_url} failed with error code ${response.status}`);
    return await response.json();
}

module.exports = {
    externalList,
    // Testing only
    _externalAcquire: externalAcquire,
    _externalRelease: externalRelease,
};
