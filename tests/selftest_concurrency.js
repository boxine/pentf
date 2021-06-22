const assert = require('assert').strict;

const { assertGreaterEqual } = require('../src/assert_utils');
const { _computeConcurrency: computeConcurrency } = require('../src/config');

async function run() {
    assertGreaterEqual(computeConcurrency('cpus'), 1);

    assert.equal(computeConcurrency('5', { cpuCount: 1 }), 5);
    assert.equal(computeConcurrency('cpus', { cpuCount: 12 }), 12);
    assert.equal(computeConcurrency('3+cpus', { cpuCount: 2 }), 5);
    assert.equal(computeConcurrency('3+cpus', { cpuCount: 3 }), 6);
    assert.equal(computeConcurrency('3 + 2 * cpus', { cpuCount: 1 }), 5);
    assert.equal(computeConcurrency('3 + 2 * cpus', { cpuCount: 2 }), 7);

    assert.throws(() => computeConcurrency('invalid'), {
        message: 'Invalid concurrency spec "invalid"',
    });
}

module.exports = {
    description: 'Set concurrency based on CPU count',
    resources: [],
    run,
};
