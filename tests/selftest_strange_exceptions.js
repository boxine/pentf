const assert = require('assert').strict;

const runner = require('../runner');
const render = require('../render');

async function run() {
    let output = [];
    const runnerConfig = {
        no_locking: true,
        concurrency: 0,
        quiet: true,
        logFunc: (_config, msg) => output.push(msg),
    };

    class Strange { }

    const testCases = [{
        name: 'throw_string',
        run: async () => { throw 'foo'; },
    }, {
        name: 'throw_empty_string',
        run: async () => { throw ''; },
    }, {
        name: 'throw_undefined',
        run: async () => { throw undefined; },
    }, {
        name: 'throw_0',
        run: async () => { throw 0; }
    }, {
        name: 'throw_1',
        run: async () => { throw 1; }
    }, {
        name: 'throw_true',
        run: async () => { throw true; }
    }, {
        name: 'throw_false',
        run: async () => { throw false; }
    }, {
        name: 'throw_null',
        run: async () => { throw null; }
    }, {
        name: 'throw_symbol',
        run: async () => { throw Symbol('foo'); }
    }, {
        name: 'throw_function',
        run: async () => { throw () => 1 + 2; }
    }, {
        name: 'throw_promise',
        run: async () => { throw new Promise(() => { }); }
    }, {
        name: 'throw_array',
        run: async () => { throw ['test']; }
    }, {
        name: 'throw_object',
        run: async () => { throw new Strange(); }
    }, {
        name: 'throw_class',
        run: async () => { throw Strange; }
    }];

    const testInfo = await runner.run(runnerConfig, testCases);
    assert(output.some(line => line.includes('Non-error object thrown by throw_string: "foo"')));
    assert(output.some(line => line.includes('Non-error object thrown by throw_empty_string: ""')));
    assert(output.some(line => line.includes('Non-error object thrown by throw_undefined: undefined')));
    assert(output.some(line => line.includes('Non-error object thrown by throw_0: 0')));
    assert(output.some(line => line.includes('Non-error object thrown by throw_1: 1')));
    assert(output.some(line => line.includes('Non-error object thrown by throw_true: true')));
    assert(output.some(line => line.includes('Non-error object thrown by throw_false: false')));
    assert(output.some(line => line.includes('Non-error object thrown by throw_null: null')));
    assert(output.some(line => line.includes('Non-error object thrown by throw_symbol: Symbol(foo)')));
    assert(output.some(line => line.includes('Non-error object thrown by throw_function: () => 1 + 2')));
    assert(output.some(line => line.includes('Non-error object thrown by throw_promise: [object Promise]')));
    assert(output.some(line => line.includes('Non-error object thrown by throw_array: ["test"]')));
    assert(output.some(line => line.includes('Non-error object thrown by throw_object: [object Object]')));
    assert(output.some(line => line.includes('Non-error object thrown by throw_class: class Strange { }')));

    // Not crashing is sufficient for us
    const results = render.craftResults(runnerConfig, testInfo);
    render._html(results);
}

module.exports = {
    description: 'Test dealing with strange exceptions',
    run,
};
