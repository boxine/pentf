const assert = require('assert');
const {TextDecoder} = require('util');

const imap_client_module = require('emailjs-imap-client');
const ImapClient = imap_client_module.default;
const mime_parse = require('emailjs-mime-parser').default;
const libmime = require('libmime');

const utils = require('./utils');
const output = require('./output');


function parseBody(body) {
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

function parseHeader(name, value) {
    assert(/^[a-zA-Z0-9]+$/.test(name));
    if (!value) return '';
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
        const header_date = parseHeader('Date', msg['body[header.fields (date)]']);

        const timestamp = (new Date(header_date)).getTime();
        if (timestamp < since_timestamp - 60 * 1000) {
            continue;
        }

        const header_to = parseHeader('To', msg['body[header.fields (to)]']);
        if (header_to.toLowerCase() != to.toLowerCase()) {
            continue;
        }

        const subject = parseHeader('Subject', msg['body[header.fields (subject)]']);
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
        return parseBody(newest_msg['body[]']);
    }

    return undefined;
}

async function connect(config, user) {
    const client = new ImapClient(config.imap.host, config.imap.port, {
        logLevel: config.email_verbose ? imap_client_module.LOG_LEVEL_DEBUG : imap_client_module.LOG_LEVEL_INFO,
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

async function getMail(
    config, since, to, subject_contains,
    wait_times=[
        200, 500, 1000, 2000, // for local setups where the email arrives immediately
        5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, // 1 minute for decent mail servers
        10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000]) { // 2 minutes for delays

    assert(Array.isArray(wait_times));

    let user = config.imap.user;
    if (user === '__to__') {
        user = to;
    }

    let {email_cached_clients} = config;
    if (! email_cached_clients) {
        email_cached_clients = config.email_cached_clients = new Map();
    }
    let client = email_cached_clients.get(user);
    let do_logout = false;
    if (client) {
        output.logVerbose(config, `[email] Reusing existing client for ${user}`);
    } else {
        output.logVerbose(config, `[email] Connecting to account ${user}`);
        client = await connect(config, user);

        if (!email_cached_clients.has(user) && config.email_new_client !== 'always') {
            email_cached_clients.set(user, client);
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
        output.logVerbose(config, `[email] Closed client for ${user}`);
    }

    return msg;
}

async function shutdown(config) {
    if (! config.email_cached_clients) return;

    const client_list = Array.from(config.email_cached_clients.values());
    if (client_list.length > 0) {
        output.logVerbose(config, `[email] Shutting down ${client_list.length} clients`);
    }
    await Promise.all(client_list.map(client => client.close()));
    config.email_cached_clients.clear();
}

module.exports = {
    connect,
    getMail,
    parseBody,
    parseHeader,
    shutdown,
};
