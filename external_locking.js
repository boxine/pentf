// Locking functions for communication with the lockserver

const assert = require('assert').strict;
const os = require('os');

const {fetch} = require('./net_utils');
const output = require('./output');

const REFRESH_INTERVAL = 30000;
const REQUEST_EXPIRE_IN = 40000;

async function externalAcquire(config, resources, expireIn) {
    assert(config.external_locking_client);
    assert(config.external_locking_url);
    assert(Array.isArray(resources));
    assert(resources.every(r => typeof r === 'string'));
    assert(Number.isInteger(expireIn));

    const response = await fetch(config, config.external_locking_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
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
            `failed with error code ${response.status}`);
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
        headers: {
            'Content-Type': 'application/json',
        },
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
        headers: {
            'Content-Type': 'application/json',
        },
    });

    assert.equal(
        response.status, 200,
        `Resource listing at ${config.external_locking_url} failed with error code ${response.status}`);
    return await response.json();
}

async function listLocks(config) {
    const locks = await externalList(config);
    console.table(locks); // eslint-disable-line no-console
}

async function clearAllLocks(config) {
    const locks = await externalList(config);
    await Promise.all(locks.map(async l => {
        const res = await externalRelease(config, [l.resource], l.client);
        assert.strictEqual(res, true);
    }));
}


function generateClientName() {
    const _prefixDash = s => s ? `${s}-` : '';
    const {env} = process;

    if (env.CI_PROJECT_NAME && env.CI_COMMIT_SHA) {
        // Running in CI
        const commitName = (env.CI_COMMIT_TAG || env.CI_BRANCH || '').slice(0, 30);
        const commitHash = env.CI_COMMIT_SHORT_SHA || env.CI_COMMIT_SHA;
        const envName = env.CI_ENVIRONMENT_NAME || '';

        return (
            `ci-${env.CI_PROJECT_NAME.slice(0, 20)}` +
            `${_prefixDash(commitName)}-${commitHash}${_prefixDash(envName)}
            ${_prefixDash(env.CI_PIPELINE_ID)}-${Date.now()}`
        );
    }

    return `${os.hostname()}-${os.userInfo().username}-${Date.now()}`;
}

function prepare(config) {
    if (! config.external_locking_url) {
        config.no_external_locking = true;
    }

    config.external_locking_client = generateClientName();
    if (config.locking_verbose) {
        output.log(config, `[exlocking] Client id: ${config.external_locking_client}`);
    }
}

async function refresh(state) {
    const {config, locks} = state;
    assert(locks);
    if (locks.size > 0) {
        const locksArray = Array.from(locks);

        try {
            const acquireRes = await externalAcquire(config, locksArray, REQUEST_EXPIRE_IN);
            if (acquireRes !== true) {
                state.external_locking_failed = true;
                output.log(config, `[exlocking] Lock refresh failed: ${acquireRes.client} holds ${acquireRes.resource}, expires in ${acquireRes.expireIn} ms`);
            } else {
                if (config.locking_verbose) {
                    const locks_str = locksArray.sort().join(',');
                    output.log(config, `[exlocking] Refreshed locks ${locks_str}`);
                }
            }
        } catch (e) {
            state.external_locking_failed = true;
            output.log(config, `[exlocking] Lock refresh errored: ${e.stack}`);
        }
    }

    state.external_locking_refresh_timeout = setTimeout(() => refresh(state), REFRESH_INTERVAL);
}

async function init(state) {
    if (state.config.no_external_locking) return;
    state.external_locking_refresh_timeout = setTimeout(() => refresh(state), REFRESH_INTERVAL);
}

async function shutdown(state) {
    if (state.config.no_external_locking) return;
    assert(state.external_locking_refresh_timeout);
    clearTimeout(state.external_locking_refresh_timeout);
}

module.exports = {
    clearAllLocks,
    externalAcquire,
    externalList,
    externalRelease,
    init,
    listLocks,
    prepare,
    shutdown,
};
