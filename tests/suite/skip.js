/**
 * @param {import('../../src/loader').TestFn} test
 */
function runSuite(test, suite) {
    test('Test A', () => {});
    test.skip('Test B', () => {});

    suite('Group 1', () => {
        test('Test 1.A', () => {});
        test('Test 1.B', () => {});

        suite.skip('Group 1.1', () => {
            test('Test 1.1.A', () => {});
            test('Test 1.1.B', () => {});
        });
    });
}

module.exports = {
    runSuite,
};
