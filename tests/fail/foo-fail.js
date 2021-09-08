async function run() {
    throw new Error('fail');
}

module.exports = {
    description: 'Just a failing test',
    run,
};
