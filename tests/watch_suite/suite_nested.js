/**
 * @param {import('../../src/loader').TestFn} test
 */
function suite(test, describe) {
    test('Test A', () => {});
    test('Test B', () => {});

    describe('Group 1', () => {
        test('Test 1.A', () => {});
        test('Test 1.B', () => {});

        describe('Group 1.1', () => {
            test('Test 1.1.A', () => {});
            test('Test 1.1.B', () => {});
        });
    });
}

module.exports = {
    suite,
};
