const { wait } = require('../src/utils');

async function run() {
    console.log('foo');
    await wait(200);
    console.log('foo');
}

module.exports = {
    description: 'Test console forwarding',
    // Can't find an automatic way to test this
    skip: () => !process.stderr.isTTY || true,
    run,
};
