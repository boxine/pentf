async function run() {
    throw new Error('fail');
}

module.exports = {
    description: 'Test that fails',
    run,
};
