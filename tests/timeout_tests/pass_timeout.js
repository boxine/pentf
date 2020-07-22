async function run() {
    await new Promise(resolve => setTimeout(resolve, 50));
}

module.exports = {
    description: 'Pass because test finishes before timeout',
    resources: [],
    run,
};
