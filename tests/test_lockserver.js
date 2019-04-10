const assert = require('assert');

const {fetch} = require('../net_utils');
const {externalList, _externalAcquire, _externalRelease} = require('../external_locking');
const {wait, cmpKey} = require('../utils');


async function run(config) {
    assert(config.pintf_lockserver_url);

    const baseUrl = `${config.pintf_lockserver_url}test_lockserver_${Math.random().toString(36).slice(2)}`;
    const config1 = {
        ...config,
        no_locking: false,
        external_locking_client: 'test_lockserver ONE',
        external_locking_url: baseUrl,
    };
    const config2 = {
        ...config,
        no_locking: false,
        external_locking_client: 'test_lockserver two',
        external_locking_url: baseUrl,
    };

    // Smoke test: List should initially be empty
    assert.deepStrictEqual(await externalList(config1), []);

    // Client is required
    const acquireWithoutClientRes = await fetch(config1, baseUrl, {
        method: 'POST',
        body: JSON.stringify({
            resources: ['foo'],
            expireIn: 30000,
        }),
    });
    assert.equal(acquireWithoutClientRes.status, 400);

    // Can only acquire for up to 1 minute
    const acquireTooLong = await fetch(config1, baseUrl, {
        method: 'POST',
        body: JSON.stringify({
            resources: ['foo'],
            client: 'foo',
            expireIn: 100000,
        }),
    });
    assert.equal(acquireTooLong.status, 400);

    // Actually acquire something
    let acquireRes = await _externalAcquire(config1, ['test1', 'widget1', 'widget2', 'widget3'], 30000);
    assert.strictEqual(acquireRes, true);

    const firstList = await externalList(config1);
    const firstExpireIn = firstList[0].expireIn;
    assert(firstExpireIn > 20000);
    assert(firstExpireIn <= 30000);
    assert.deepStrictEqual(firstList.map(l => l.resource).sort(), ['test1', 'widget1', 'widget2', 'widget3']);
    assert.deepStrictEqual(firstList.map(l => l.client), [config1.external_locking_client, config1.external_locking_client, config1.external_locking_client, config1.external_locking_client]);
    assert.deepStrictEqual(firstList.map(l => l.expireIn), [firstExpireIn, firstExpireIn, firstExpireIn, firstExpireIn]);

    await wait(2); // ensure clock tick
    const secondList = await externalList(config2);
    assert.deepStrictEqual(secondList.map(l => l.resource).sort(), ['test1', 'widget1', 'widget2', 'widget3']);
    assert(secondList.every(l => l.client === config1.external_locking_client));
    const secondExpireIn = secondList[0].expireIn;
    assert(secondExpireIn < firstExpireIn);
    assert(secondExpireIn > 15000);
    assert(secondExpireIn <= 30000);
    assert.deepStrictEqual(secondList.map(l => l.expireIn), [secondExpireIn, secondExpireIn, secondExpireIn, secondExpireIn]);

    // Extend locks
    acquireRes = await _externalAcquire(config1, ['test1', 'widget1', 'widget2', 'widget3'], 40000);
    assert.strictEqual(acquireRes, true);

    let curList = await externalList(config2);
    assert.deepStrictEqual(curList.map(l => l.resource).sort(), ['test1', 'widget1', 'widget2', 'widget3']);
    assert(curList.every(l => l.client === config1.external_locking_client));
    const thirdExpireIn = curList[0].expireIn;
    assert(thirdExpireIn > 30000);
    assert(thirdExpireIn <= 40000);
    assert.deepStrictEqual(curList.map(l => l.expireIn), [thirdExpireIn, thirdExpireIn, thirdExpireIn, thirdExpireIn]);

    // Extending can add new locks
    acquireRes = await _externalAcquire(config1, ['test1', 'widget1', 'widget2', 'widget4'], 50000);
    assert.strictEqual(acquireRes, true);

    curList = await externalList(config1);
    curList.sort(cmpKey('resource'));
    assert.deepStrictEqual(
        curList.map(l => l.resource), ['test1', 'widget1', 'widget2', 'widget3', 'widget4']);
    assert(curList.every(l => l.client === config1.external_locking_client));
    assert(curList[0].expireIn > 40000);
    assert(curList[0].expireIn <= 50000);
    assert(curList[1].expireIn > 40000);
    assert(curList[1].expireIn <= 50000);
    assert(curList[2].expireIn > 40000);
    assert(curList[2].expireIn <= 50000);
    // widget 3 was not extended
    assert(curList[3].expireIn > 25000);
    assert(curList[3].expireIn <= 40000);
    assert(curList[4].expireIn > 40000);
    assert(curList[4].expireIn <= 50000);

    // Second client can not acquire resources locked by the first one
    acquireRes = await _externalAcquire(config2, ['widget1', 'client2'], 10000);
    assert.strictEqual(acquireRes.client, config1.external_locking_client);
    assert.strictEqual(acquireRes.firstResource, 'widget1');
    assert(acquireRes.expireIn > 39000);
    assert(acquireRes.expireIn <= 50000);

    curList = (await externalList(config1)).sort(cmpKey('resource'));
    assert.deepStrictEqual(
        curList.map(l => l.resource), ['test1', 'widget1', 'widget2', 'widget3', 'widget4']);
    assert(curList.every(l => l.client === config1.external_locking_client));

    // Second client can not delete resources locked by the first one
    let releaseRes = await _externalRelease(config2, ['widget1'], 10000);
    assert.strictEqual(releaseRes.client, config1.external_locking_client);
    assert.strictEqual(releaseRes.firstResource, 'widget1');
    assert(releaseRes.expireIn > 39000);
    assert(releaseRes.expireIn <= 50000);
    curList = (await externalList(config1)).sort(cmpKey('resource'));
    assert.deepStrictEqual(
        curList.map(l => l.resource), ['test1', 'widget1', 'widget2', 'widget3', 'widget4']);
    assert(curList.every(l => l.client === config1.external_locking_client));

    // First client can delete their resources
    releaseRes = await _externalRelease(config1, ['test1', 'widget1', '404']);
    assert.deepStrictEqual(releaseRes, true);
    curList = (await externalList(config1)).sort(cmpKey('resource'));
    assert.deepStrictEqual(
        curList.map(l => l.resource), ['widget2', 'widget3', 'widget4']);
    assert(curList.every(l => l.client === config1.external_locking_client));

    // Second client can now acquire resources
    acquireRes = await _externalAcquire(config2, ['widget1', 'client2'], 20000);
    assert.deepStrictEqual(acquireRes, true);
    curList = (await externalList(config1)).sort(cmpKey('resource'));
    assert.deepStrictEqual(
        curList.map(({client, resource}) => {return {client, resource};}),
        [
            {resource: 'client2', client: config2.external_locking_client},
            {resource: 'widget1', client: config2.external_locking_client},
            {resource: 'widget2', client: config1.external_locking_client},
            {resource: 'widget3', client: config1.external_locking_client},
            {resource: 'widget4', client: config1.external_locking_client},
        ]
    );

}

module.exports = {
    description: 'Check functionality of a lockserver',
    run,
    resources: [],
};
