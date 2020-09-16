const assert = require('assert').strict;

const {loadTests} = require('../src/loader');

async function run(config) {
    assert.deepStrictEqual(
        (await loadTests(
            {
                filter: 'lo[ao]der',
                rootDir: config.rootDir
            },
            'tests/*.js'
        )).map(
            t => t.name
        ),
        ['loader.test']
    );

    // random string: he5Eih1ohhhhhhai8sho
    const byBody = await loadTests(
        {
            filter: '[a-l]',
            filter_body: 'he5Eih1oh+ai8sho',
            rootDir: config.rootDir,
        },
        'tests/*.js'
    );
    assert.deepStrictEqual(
        byBody.map(t => t.name),
        ['loader.test']
    );
}

module.exports = {
    description: 'Test test loading and filtering',
    run,
};
