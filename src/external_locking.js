// Locking functions for communication with the lockserver

const assert = require('assert').strict;
const os = require('os');

const {fetch} = require('./net_utils');
const output = require('./output');
const {localIso8601} = require('./utils');
const {pentfVersion} = require('./version');

const REFRESH_INTERVAL = 30000;
const REQUEST_EXPIRE_IN = 40000;

/**
 * @param {import('./config').Config} config
 * @param {string[]} resources
 * @param {number} expireIn
 * @returns {Promise<boolean | any>}
 */
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

/**
 * @param {import('./config').Config} config
 * @param {string[]} resources
 * @param {string} [overrideClient]
 * @returns {Promise<true | any>}
 */
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

/**
 * @param {import('./config').Config} config
 * @returns {Promise<Array<import('./locking').Lock>>}
 */
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

/**
 * @param {import('./config').Config} config
 * @private
 */
async function listLocks(config) {
    const locks = await externalList(config);
    console.table(locks); // eslint-disable-line no-console
}

/**
 * @param {import('./config').Config} config
 */
async function clearAllLocks(config) {
    const locks = await externalList(config);
    await Promise.all(locks.map(async l => {
        const res = await externalRelease(config, [l.resource], l.client);
        assert.strictEqual(res, true);
    }));
}

function generateClientName({env=process.env, nowStr=localIso8601(new Date())} = {}) {
    function _format(s, maxLen=30) {
        if (!s) return '';
        s = s.trim().slice(0, maxLen);
        return ' ' + s;
    }

    if (env.CI_PROJECT_NAME && env.CI_COMMIT_SHA) {
        // Running in CI
        const projectName = _format(env.CI_PROJECT_NAME);
        const commitName = _format(env.CI_COMMIT_TAG || env.CI_BRANCH, 50);
        const commitHash = _format(env.CI_COMMIT_SHORT_SHA || env.CI_COMMIT_SHA);
        const envName = _format(env.CI_ENVIRONMENT_NAME);
        const jobURL = _format(env.CI_JOB_URL, 100);

        return (
            `ci${projectName}${commitName}${commitHash}${envName}${jobURL} ${pentfVersion()}` +
            ` ${nowStr}`
        ).slice(0, 256);
    }

    return `${os.userInfo().username}@${os.hostname()} ${pentfVersion()} ${nowStr}`;
}

/**
 * @param {import('./config').Config} config
 * @private
 */
function prepare(config) {
    if (! config.external_locking_url) {
        config.no_external_locking = true;
    }

    config.external_locking_client = generateClientName();
    if (config.locking_verbose) {
        output.log(config, `[exlocking] Client id: ${config.external_locking_client}`);
    }
}

/**
 * @param {import('./confg').Config} config
 * @param {import('./runner').RunnerState} state
 * @private
 */
async function refresh(config, state) {
    const {locks} = state;
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

    state.external_locking_refresh_timeout = setTimeout(() => refresh(config, state), REFRESH_INTERVAL);
}

/**
 * @param {import('./config').Config} state
 * @param {import('./runner').RunnerState} state
 * @private
 */
async function init(config, state) {
    if (config.no_external_locking) return;
    state.external_locking_refresh_timeout = setTimeout(() => refresh(config, state), REFRESH_INTERVAL);
}

/**
 * @param {import('./config').Config} config
 * @param {import('./runner').RunnerState} state
 * @private
 */
async function shutdown(config, state) {
    if (config.no_external_locking) return;
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
    // Tests only
    _generateClientName: generateClientName,
};
