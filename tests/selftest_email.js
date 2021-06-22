const assert = require('assert').strict;

const { parseHeader } = require('../src/email');

async function run() {
    assert.equal(parseHeader('To', 'To: somebody\r\n'), 'somebody');
    assert.equal(parseHeader('To', 'tO:somebody \r\n'), 'somebody');

    try {
        assert.equal(parseHeader('Subject', 'To: somebody\r\n'), 'somebody');
        assert(false, 'Should throw an exception');
    } catch (_) {
        // Should throw
    }

    assert.equal(
        parseHeader(
            'To',
            'To: integrationtests+api2_invitation_owner3mmx1hxg467@boxine.de\r\n abc\r\n abc\r\n'
        ),
        'integrationtests+api2_invitation_owner3mmx1hxg467@boxine.de abc abc'
    );
}

module.exports = {
    description: 'Testing the integration test framework itself: Email parsing',
    run,
};
