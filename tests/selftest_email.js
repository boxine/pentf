const assert = require('assert');

const {_parse_header} = require('../pintf/email');

async function run() {
    assert.equal(_parse_header('To', 'To: somebody\r\n'), 'somebody');
    assert.equal(_parse_header('To', 'tO:somebody \r\n'), 'somebody');

    try {
        assert.equal(_parse_header('Subject', 'To: somebody\r\n'), 'somebody');
        assert(false, 'Should throw an exception');
    } catch (_) {
        // Should throw
    }

    assert.equal(
        _parse_header('To',
            'To: integrationtests+api2_invitation_owner3mmx1hxg467@boxine.de\r\n abc\r\n abc\r\n'),
        'integrationtests+api2_invitation_owner3mmx1hxg467@boxine.de abc abc');
}

module.exports = {
    description: 'Testing the integration test framework itself: Email parsing',
    run,
};
