const assert = require('assert');
const {TextDecoder} = require('util');

const ImapClient = require('emailjs-imap-client').default;
const mime_parse = require('emailjs-mime-parser').default;
const libmime = require('libmime');

const utils = require('./utils');


function parse_body(body) {
    assert(body instanceof Uint8Array);
    const parsed = mime_parse(body);
    const subject = parsed.headers.subject[0].value;
    assert(subject);
    const res = {
        subject,
    };
    for (const part of parsed.childNodes) {
        const mtype = part.headers['content-type'][0].value;
        if (mtype === 'text/plain') {
            res.text = (new TextDecoder(part.charset)).decode(part.content);
        } else if (mtype === 'text/html') {
            res.html = (new TextDecoder(part.charset)).decode(part.content);
        }
    }

    const text_body = (new TextDecoder('utf-8')).decode(body);
    const header_end_m = /(?:\r?\n){2}/.exec(text_body);
    if (header_end_m) {
        res.header = text_body.slice(0, header_end_m.index);
    }

    return res;
}

function parse_header(name, value) {
    assert(/^[a-zA-Z0-9]+$/.test(name));
    const expect = name.toLowerCase() + ':';
    if (value.substring(0, expect.length).toLowerCase() !== expect) {
        throw new Error('Cannot parse ' + name + ': in ' + JSON.stringify(value));
    }
    value = value.substring(expect.length);

    if (value.includes('\n')) {
        value = value.split(/\r?\n/).join('');
    }
    return libmime.decodeWords(value.trim());
}

async function _find_message(config, client, since, to, subject_contains) {
    const messages = await client.listMessages(
        'INBOX', '1:*', [
            'UID',
            'BODY.PEEK[HEADER.FIELDS (SUBJECT)]',
            'BODY.PEEK[HEADER.FIELDS (DATE)]',
            'BODY.PEEK[HEADER.FIELDS (TO)]'
        ], {byUid: false});

    const since_timestamp = since.getTime();
    let newest_timestamp = 0;
    let newest_msg = undefined;
    for (const msg of messages) {
        const header_date = parse_header('Date', msg['body[header.fields (date)]']);

        const timestamp = (new Date(header_date)).getTime();
        if (timestamp < since_timestamp - 60 * 1000) {
            continue;
        }

        const header_to = parse_header('To', msg['body[header.fields (to)]']);
        if (header_to.toLowerCase() != to.toLowerCase()) {
            continue;
        }

        const subject = parse_header('Subject', msg['body[header.fields (subject)]']);
        if (! subject.includes(subject_contains)) {
            continue;
        }

        if (timestamp > newest_timestamp) {
            const full_msg = (await client.listMessages(
                'INBOX', msg.uid, ['UID', 'body[]'], {byUid: true, valueAsString: false}))[0];
            if (full_msg) {
                newest_msg = full_msg;
                newest_timestamp = timestamp;
            }
        }
    }

    if (newest_msg) {
        if (! config.keep_emails) {
            await client.deleteMessages('INBOX', newest_msg.uid, {byUid: true});
        }
        return parse_body(newest_msg['body[]']);
    }

    return undefined;
}

async function connect(config, user) {
    const client = new ImapClient(config.imap.host, config.imap.port, {
        logLevel: 'info',
        auth: {
            user,
            pass: config.imap.password,
        },
        useSecureTransport: config.imap.tls,
    });
    await client.connect();
    await client.selectMailbox('INBOX', {});
    return client;
}

const cached_clients = new Map();

async function get_mail(
    config, since, to, subject_contains,
    wait_times=[200, 500, 1000, 2000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000]) {

    assert(Array.isArray(wait_times));

    let user = config.imap.user;
    if (user === '__to__') {
        user = to;
    }

    let client = cached_clients.get(user);
    let do_logout = false;
    if (! client) {
        client = await connect(config, user);

        if (!cached_clients.has(user) && config.email_new_client !== 'always') {
            cached_clients.set(user, client);
        } else {
            do_logout = true;
        }
    }

    const msg = await utils.retry(
        () => _find_message(config, client, since, to, subject_contains), wait_times);
    assert(msg, (
        'Could not find message to ' + to + ' matching ' + JSON.stringify(subject_contains) + ' since ' + since));

    if (do_logout) {
        await client.close();
    }

    return msg;
}

async function shutdown() {
    await Promise.all(Array.from(cached_clients.values()).map(client => client.close()));
    cached_clients.clear();
}

module.exports = {
    connect,
    get_mail,
    parse_body,
    parse_header,
    shutdown,
};
