const assert = require('assert').strict;

const { getMail } = require('../src/email');
const { filterMap } = require('../src/utils');

class PseudoEmailClient {
    listMessages(path, sequence, query, options) {
        return filterMap(PSEUDO_EMAILS, email => {
            if (sequence !== '1:*' && sequence != email.uid) {
                return false;
            }

            const copy = {};
            for (let field of query) {
                field = field.toLowerCase().replace('.peek', '');

                if (field === 'body[]') {
                    let body =
                        email['body[header.fields (subject)]'].trim() +
                        '\r\n' +
                        email['body[header.fields (date)]'].trim() +
                        '\r\n' +
                        email['body[header.fields (to)]'].trim() +
                        '\r\n' +
                        '\r\n' +
                        email._message;

                    assert.equal(options.valueAsString, false);
                    copy['body[]'] = new TextEncoder().encode(body);
                    continue;
                }

                assert(email[field], `Missing field ${field} in test email`);
                copy[field] = email[field];
            }

            return copy;
        });
    }
}

const PSEUDO_EMAILS = [
    {
        '#': 1,
        uid: 5000001,
        'body[header.fields (subject)]': 'Subject: Email Number 1\r\n\r\n',
        'body[header.fields (date)]':
            'Date: Thu, 31 Aug 2023 14:50:10 +0000\r\n\r\n',
        'body[header.fields (to)]': 'To: foo@bar.example\r\n\r\n',
        _message: 'msg 1',
    },
    {
        '#': 2,
        uid: 5000002,
        'body[header.fields (subject)]': 'Subject: Email Number 2\r\n\r\n',
        'body[header.fields (date)]':
            'Date: Thu, 31 Aug 2023 15:11:10 +0000\r\n\r\n',
        'body[header.fields (to)]': 'To: foo@bar.example\r\n\r\n',
        _message: 'msg 2',
    },
    {
        '#': 3,
        uid: 5000003,
        'body[header.fields (subject)]': 'Subject: Number 3\r\n\r\n',
        'body[header.fields (date)]':
            'Date: Thu, 31 Aug 2023 15:12:10 +0000\r\n\r\n',
        'body[header.fields (to)]': 'To: somebody@else.example\r\n\r\n',
        _message: 'msg 3',
    },
    {
        '#': 4,
        uid: 5000004,
        'body[header.fields (subject)]': 'Subject: Zahl 4\r\n\r\n',
        'body[header.fields (date)]':
            'Date: Thu, 31 Aug 2023 15:44:00 +0000\r\n\r\n',
        'body[header.fields (to)]': 'To: foo@bar.example\r\n\r\n',
        _message: 'msg 4',
    },
    {
        '#': 5,
        uid: 5000005,
        'body[header.fields (subject)]': 'Subject: Number 5\r\n\r\n',
        'body[header.fields (date)]':
            'Date: Thu, 31 Aug 2023 15:55:00 +0000\r\n\r\n',
        'body[header.fields (to)]': 'To: foo@bar.example\r\n\r\n',
        _message: 'msg 5',
    },
];

async function run() {
    const client = new PseudoEmailClient();
    const pseudoConfig = {
        imap: {
            user: 'foo@bar.example',
        },
        keep_emails: true,
        email_cached_clients: new Map([['foo@bar.example', client]]),
    };

    const since = new Date('Thu, 31 Aug 2023 15:00:00 +0000');
    const firstMail = await getMail(
        pseudoConfig,
        since,
        'foo@bar.example',
        'Number',
        [1]
    );
    assert.equal(firstMail.text, 'msg 5');

    const matchedByFuncMail = await getMail(
        pseudoConfig,
        since,
        'foo@bar.example',
        subject => {
            return subject.endsWith('4');
        },
        [1]
    );
    assert.equal(matchedByFuncMail.text, 'msg 4');

    // Not matched because too old
    await assert.rejects(
        getMail(pseudoConfig, since, 'foo@bar.example', 'Number 1', [1])
    );

    // Not matched because wrong recipient
    await assert.rejects(
        getMail(pseudoConfig, since, 'foo@bar.example', 'Number 3', [1])
    );
}

module.exports = {
    description: 'Email fetching',
    run,
};
