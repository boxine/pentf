const assert = require('assert').strict;
const path = require('path');

const {wait} = require('../utils');
const locking = require('../locking');

async function run(config) {
    const baseUrl = `${config.pentf_lockserver_url}test_lockserver_${Math.random()
        .toString(36)
        .slice(2)}`;
    const config1 = {
        ...config,
        no_locking: false,
        external_locking_client: 'test_lockserver ONE',
        external_locking_url: baseUrl,
    };

    const pool = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE'].map(r => path.basename(__filename)+r);

    const lock1 = await locking.acquireFromPool(config1, pool, 1);
    assert.deepEqual(lock1, [pool[0]]);

    const lock2 = await locking.acquireFromPool(config1, pool, 1);
    assert.deepEqual(lock2, [pool[1]]);
    
    const lock3 = await locking.acquireFromPool(config1, pool, 1);
    assert.deepEqual(lock3, [pool[2]]);
    
    // Acquire multiple locks at once
    const lock4 = await locking.acquireFromPool(config1, pool, 2);
    assert.deepEqual(lock4, [pool[3], pool[4]]);


    // At this point all resources of the pool are exhausted.
    // We should not be able to get a lock.
    const res = await Promise.race([locking.acquireFromPool(config1, pool, 1), wait(100)]);
    assert.equal(res, undefined);

    // Free one resource
    await locking.release(config, {locking: config._locking}, {id: config._taskId});
    const lock5 = await locking.acquireFromPool(config1, pool, 1);
    assert.deepEqual(lock5, [pool[0]]);
}

module.exports = {
    description: 'Lock random item from resource pool',
    run,
};
