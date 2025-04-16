const assert = require('assert').strict;

const { findHTTPHeader } = require('../src/net_utils');

async function run() {
    assert.equal(
        findHTTPHeader(
            {
                Authorization: 'secret',
                'User-agent': 'xx',
            },
            'User-Agent'
        ),
        'User-agent'
    );

    assert.equal(findHTTPHeader({}, 'User-Agent'), undefined);
}

module.exports = {
    description:
        'Test net_utils.findHTTPHeader for case-insensitive search in HTTP header specifications',
    resources: [],
    run,
};
