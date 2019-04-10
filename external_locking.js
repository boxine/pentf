// Locking functions for communication with the lockserver

const assert = require('assert');
const os = require('os');

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

async function externalRelease(config, resources, overrideClient) {
    const client = overrideClient || config.external_locking_client;
    assert(client);
    assert.equal(typeof client, 'string');
    assert(config.external_locking_url);
    assert(Array.isArray(resources));
    assert(resources.every(r => typeof r === 'string'));

    const response = await fetch(config, config.external_locking_url, {
        method: 'DELETE',
        body: JSON.stringify({
            resources,
            client: client,
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

async function listLocks(config) {
    const locks = await externalList(config);
    console.table(locks);
}

async function clearAllLocks(config) {
    const locks = await externalList(config);
    await Promise.all(locks.map(async l => {
        const res = await externalRelease(config, [l.resource], l.client);
        assert.strictEqual(res, true);
    }));
}

function prepare(config) {
    if (! config.external_locking_url) {
        config.no_external_locking = true;
    }
    config.external_locking_client = `${os.userInfo().username}-${Date.now()}`;
}

module.exports = {
    externalList,
    listLocks,
    clearAllLocks,
    prepare,
    externalAcquire,
    externalRelease,
};
