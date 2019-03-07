const assert = require('assert');

const {timezone_offset_str} = require('../../pintf/utils');

async function run() {
    assert.equal(timezone_offset_str(0), 'Z');
    assert.equal(timezone_offset_str(-61), '+01:01');
    assert.equal(timezone_offset_str(-540), '+09:00');
    assert.equal(timezone_offset_str(60), '-01:00');
    assert.equal(timezone_offset_str(145), '-02:25');
}

module.exports = {
    description: 'Testing the integration test framework itself: Small utility functions',
    run,
};
