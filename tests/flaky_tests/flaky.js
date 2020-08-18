const state = new Map();
async function run(config) {
    const group = config._taskGroup;
    let i = state.has(group) ? state.get(group) : -1;
    i++;
    if (i === 0 || (i + 1) % 3 !== 0) {
        state.set(group, i);
        throw new Error('fail');
    } else {
        state.set(group, i);
    }
}

module.exports = {
    description: 'Test that is flaky and fails every 3rd run in the same flaky group',
    run,
};
