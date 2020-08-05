async function run() {}

module.exports = {
    description: 'Should pass but expected to fail',
    run,
    expectedToFail: () => 'Expect to fail'
};
