const state = new Map();
async function run(config) {
    let i = state.has(config._taskName) ? state.get(config._taskName) : -1;
    i++;
    if (i === 0 || (i + 1) % 3 !== 0) {
        state.set(config._taskName, i);
        throw new Error('fail');
    } else {
        state.set(config._taskName, i);
    }
}

module.exports = {
    description: 'Test that is flaky and fails every 3rd run in the same flaky group',
    run,
};
