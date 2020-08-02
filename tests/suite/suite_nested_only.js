/**
 * @param {import('../../src/loader').TestFn} test
 * @param {import('../../src/loader').DescribeFn} test
 */
function runSuite(test, suite) {
    test('Test A', () => {});
    test('Test B', () => {});

    suite('Group 1', () => {
        test('Test 1.A', () => {});
        test('Test 1.B', () => {});

        suite.only('Group 1.1', () => {
            test('Test 1.1.A', () => {});
            test('Test 1.1.B', () => {});
        });
    });
}

module.exports = {
    runSuite,
};
