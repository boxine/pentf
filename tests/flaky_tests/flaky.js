let i = 0;
async function run() {
    if (i++ < 2) {
        throw new Error('fail');
    }
}

module.exports = {
    description: 'Test that is flaky',
    run,
};
