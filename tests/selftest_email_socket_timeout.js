const assert = require('assert').strict;
const net = require('net');
const { promisify } = require('util');

const { connect } = require('../src/email');
const { wait } = require('../src/utils');

async function run() {
    // Set up example IMAP server
    let healthy = false;
    const server = net.createServer(async socket => {
        socket.on('close', () => {});

        socket.write('* OK IMAP4rev1 Server test ready\r\n');
        if (healthy) {
            socket.on('data', function (data) {
                const input = data.toString('utf-8');

                for (let line of input.split('\n')) {
                    line = line.trim();
                    if (!line) continue;

                    const m = /^(\S+)\s(\S+)/.exec(line);
                    assert(m, `Could not parse line ${JSON.stringify(line)}`);
                    const msgId = m[1];
                    const command = m[2].toUpperCase();
                    if (command === 'CAPABILITY') {
                        socket.write(
                            '* CAPABILITY IMAP4rev1 UIDPLUS\r\n' +
                                `${msgId} OK CAPABILITY completed.\r\n`
                        );
                    } else if (command === 'LOGIN') {
                        socket.write(`${msgId} OK LOGIN completed.\r\n`);
                    } else if (command === 'SELECT') {
                        socket.write(
                            `${msgId} OK [READ-WRITE] SELECT completed.\r\n`
                        );
                    } else {
                        throw new Error(`Unsupported line ${line}`);
                    }
                }
            });
        } else {
            await wait(500); // Socket is ok at first
            socket.destroy(); // server hangs indefinitely
        }
    });

    // Manual promisify for variadic listen method
    await promisify(callback => server.listen(0, 'localhost', callback))();
    const { port } = server.address();
    assert(port);
    const pseudoConfig = {
        imap: {
            user: 'foo@example.org',
            password: 'hunter2',
            host: '127.0.0.1',
            port,
            tls: false,
        },
    };

    // A short timeout will be triggered immediately
    // Note that socket_timeout the *minimal* timeout, emailjs adds some ms more per byte
    pseudoConfig.imap.socket_timeout = 1;
    await assert.rejects(
        connect(pseudoConfig, 'foo@example.org'),
        { message: ' Socket timed out!' } // yes, with a space in front
    );

    healthy = true;
    pseudoConfig.imap.socket_timeout = 10000;
    const client = await connect(pseudoConfig, 'foo@example.org');
    client.close();

    server.close();
}

module.exports = {
    description: 'Test communication with a slow IMAP server',
    run,
    resources: [],
};
