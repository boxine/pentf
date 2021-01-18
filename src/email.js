const assert = require('assert').strict;
const {TextDecoder} = require('util');

const imap_client_module = require('emailjs-imap-client');
const ImapClient = imap_client_module.default;
const mime_parse = require('emailjs-mime-parser').default;
const libmime = require('libmime');

const utils = require('./utils');
const output = require('./output');

function parseDeep(mime_part) {

    let text = null;
    let html = null;

    for (const part of mime_part.childNodes) {
        const mtype = part.headers['content-type'][0].value;

        if (mtype === 'multipart/related' || mtype === 'multipart/alternative') {
            return parseDeep(part);
        } else if (mtype === 'text/plain') {
            text = (new TextDecoder(part.charset)).decode(part.content);
        } else if (mtype === 'text/html') {
            html = (new TextDecoder(part.charset)).decode(part.content);
        }
    }

    return { text, html };
}


function parseBody(body) {
    assert(body instanceof Uint8Array);
    const parsed = mime_parse(body);
    const subject = parsed.headers.subject[0].value;
    assert(subject);
    const res = {
        subject,
    };

    const parse_result = parseDeep(parsed);
    res.text = parse_result.text;
    res.html = parse_result.html;

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

async function _find_message(config, client, since, to, subjectContains) {
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
        if (! subject.includes(subjectContains)) {
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
        logLevel: config.email_verbose ? imap_client_module.LOG_LEVEL_DEBUG : imap_client_module.LOG_LEVEL_NONE,
        auth: {
            user,
            pass: config.imap.password,
        },
        useSecureTransport: config.imap.tls,
    });
    client.client.timeoutSocketLowerBound = config.imap.socket_timeout || (5 * 60000);
    await client.connect();
    await client.selectMailbox('INBOX', {});
    return client;
}

/**
 * Retrieve and delete an email.
 *
 * @example
 * ```javascript
 * const email = makeRandomEmail(config, 'myTestCase');
 * const start = new Date();
 * await ... // register with email
 * const welcomeMail = await getMail(config, start, email, 'Welcome');
 * assert.strictEqual(welcomeMail.text.includes('Hello'));
 * assert.strictEqual(welcomeMail.html.includes('<p>Hello'));
 * ```
 * @param {import('./runner').TaskConfig} config The pentf configuration object.
 * @param {Date} since Earliest time the email can be sent. (To avoid finding the email of a prior test.)
 * @param {string} to receiveer email address (`config.email` if you have just one email address, often the result of `makeRandomEmail`)
 * @param {string} subjectContains Search string for the subject.
 * @param {number[]} wait_times How long to wait between checking email. By default, we wait about 3 minutes total.
 * @returns {Object} Email object with `html` and `text` properties.
 */
async function getMail(
    config, since, to, subjectContains,
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
        output.logVerbose(config, `[email] Reusing existing client for ${user} (${config._taskName})`);
    } else {
        output.logVerbose(config, `[email] Connecting to account ${user} (${config._taskName})`);
        client = await connect(config, user);

        if (!email_cached_clients.has(user) && config.email_new_client !== 'always') {
            email_cached_clients.set(user, client);
        } else {
            do_logout = true;
        }
    }

    output.logVerbose(config, `[email] Waiting for message to arrive ${to}... (${config._taskName})`);
    const msg = await utils.retry(
        () => _find_message(config, client, since, to, subjectContains), wait_times);
    assert(msg, (
        'Could not find message to ' + to + ' matching ' + JSON.stringify(subjectContains) + ' since ' + since));
    output.logVerbose(config, `[email] Message arrived (${config._taskName})`);

    if (do_logout) {
        await client.close();
        output.logVerbose(config, `[email] Closed client for ${user} (${config._taskName})`);
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
