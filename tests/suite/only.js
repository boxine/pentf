/**
 * @param {import('../../loader').TestFn} test
 */
function suite(test) {
    test('Test A', () => {});
    test('Test B', () => {});
    test.only('Test C', () => {});
}

module.exports = {
    suite,
};
