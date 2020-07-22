async function run() {
    await new Promise(resolve => setTimeout(resolve, 99999999));
}

module.exports = {
    description: 'Fail because test is aborted by timeout',
    resources: [],
    run,
};
