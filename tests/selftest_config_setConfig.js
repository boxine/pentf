const assert = require('assert').strict;

const { _setConfig } = require('../src/config');

async function run() {
    const res = { foo: { number: '42' } };
    _setConfig(res, 'foo.email={"user": "joe", "domain": "mail.exmaple"}');
    _setConfig(res, 'bar.password="hunter2"');
    _setConfig(res, 'bar.baz.flux.not_json=http://example.com/just/a/string');
    _setConfig(res, 'types.number=42');
    _setConfig(res, 'types.string="42"');
    _setConfig(res, 'types.awesome=true');
    _setConfig(res, 'x=y');

    assert.deepStrictEqual(res, {
        bar: {
            baz: {
                flux: {
                    not_json: 'http://example.com/just/a/string',
                },
            },
            password: 'hunter2',
        },
        foo: {
            number: '42',
            email: {
                domain: 'mail.exmaple',
                user: 'joe',
            },
        },
        types: {
            awesome: true,
            number: 42,
            string: '42',
        },
        x: 'y',
    });
}

module.exports = {
    description: 'Test --set-config functionality',
    run,
};
