const assert = require('assert').strict;

const { loadTests } = require('../src/loader');

async function run(config) {
    assert.deepStrictEqual(
        (
            await loadTests(
                {
                    filter: 'selftest_lo[ao]der',
                    rootDir: config.rootDir,
                    moduleType: 'commonjs',
                },
                'tests/*.js'
            )
        ).map(t => t.name),
        ['selftest_loader']
    );

    // random string: he5Eih1ohhhhhhai8sho
    const byBody = await loadTests(
        {
            filter: 'selftest_[a-l]',
            filter_body: 'he5Eih1oh+ai8sho',
            rootDir: config.rootDir,
            moduleType: 'commonjs',
        },
        'tests/*.js'
    );
    assert.deepStrictEqual(
        byBody.map(t => t.name),
        ['selftest_loader']
    );
}

module.exports = {
    description: 'Test test loading and filtering',
    run,
};
