const assert = require('assert').strict;

const { parseHeader, resolveUser } = require('../src/email');

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

    assert.equal(
        resolveUser(
            { imap: { user: 'foo+a@bar.example' } },
            'somebody+123@mail.com'
        ),
        'foo+a@bar.example'
    );
    assert.equal(
        resolveUser({ imap: { user: '__to__' } }, 'somebody+123@mail.com'),
        'somebody+123@mail.com'
    );
    assert.equal(
        resolveUser(
            { imap: { user: '__to_account__' } },
            'somebody+123@mail.com'
        ),
        'somebody@mail.com'
    );
}

module.exports = {
    description: 'Testing the integration test framework itself: Email parsing',
    run,
};
