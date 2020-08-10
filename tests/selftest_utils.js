const assert = require('assert').strict;

const {timezoneOffsetString} = require('../src/utils');

async function run() {
    assert.equal(timezoneOffsetString(0), 'Z');
    assert.equal(timezoneOffsetString(-61), '+01:01');
    assert.equal(timezoneOffsetString(-540), '+09:00');
    assert.equal(timezoneOffsetString(60), '-01:00');
    assert.equal(timezoneOffsetString(145), '-02:25');
}

module.exports = {
    description: 'Testing the integration test framework itself: Small utility functions',
    resources: [],
    run,
};
