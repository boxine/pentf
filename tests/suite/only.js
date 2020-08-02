/**
 * @param {import('../../loader').TestFn} test
 */
function runSuite(test) {
    test('Test A', () => {});
    test('Test B', () => {});
    test.only('Test C', () => {});
}

module.exports = {
    runSuite,
};
