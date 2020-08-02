/**
 * @param {import('../../src/loader').TestFn} test
 */
function runSuite(test) {
    test('Test A', () => {});
    test('Test B', () => {});
}

module.exports = {
    runSuite,
};
