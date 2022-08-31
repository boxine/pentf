const assert = require('assert').strict;

const { assertGreaterEqual } = require('../src/assert_utils');
const { _computeConcurrency: computeConcurrency } = require('../src/config');

async function run() {
    assertGreaterEqual(computeConcurrency('cpus'), 1);

    assert.equal(computeConcurrency('0', { cpuCount: 1 }), 0); // sequential run
    assert.equal(computeConcurrency('5', { cpuCount: 1 }), 5);
    assert.equal(computeConcurrency('cpus', { cpuCount: 12 }), 12);
    assert.equal(computeConcurrency('3+cpus', { cpuCount: 2 }), 5);
    assert.equal(computeConcurrency('3+cpus', { cpuCount: 3 }), 6);
    assert.equal(computeConcurrency('3 + 2 * cpus', { cpuCount: 1 }), 5);
    assert.equal(computeConcurrency('3 + 2 * cpus', { cpuCount: 2 }), 7);
    assert.equal(computeConcurrency('9 - 2', { cpuCount: 2 }), 7);
    assert.equal(computeConcurrency('9 - 2 - 1 + 10 - 1', { cpuCount: 2 }), 15);
    assert.equal(computeConcurrency('2 * cpus - 5', { cpuCount: 11 }), 17);
    assert.equal(computeConcurrency('2 * cpus - 5', { cpuCount: 2 }), 1);

    assert.throws(() => computeConcurrency('invalid'), {
        message: 'Invalid concurrency spec "invalid"',
    });
    assert.throws(() => computeConcurrency('2 +'), {
        message: 'Invalid concurrency spec ""',
    });
}

module.exports = {
    description: 'Set concurrency based on CPU count',
    resources: [],
    run,
};
