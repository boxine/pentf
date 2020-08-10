/**
 * @param {import('../../src/loader').TestFn} test
 * @param {import('../../src/loader').DescribeFn} test
 */
function suite(test, describe) {
    test('Test A', () => {});
    test('Test B', () => {});

    describe('Group 1', () => {
        test('Test 1.A', () => {});
        test('Test 1.B', () => {});

        describe.only('Group 1.1', () => {
            test('Test 1.1.A', () => {});
            test('Test 1.1.B', () => {});
        });
    });
}

module.exports = {
    suite,
};
