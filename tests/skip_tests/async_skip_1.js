async function run() {
    throw new Error('Test should never run');
}

module.exports = {
    description: 'Test browser_utils.getAttribute',
    skip: () => Promise.resolve().then(() => true),
    resources: [],
    run,
};
