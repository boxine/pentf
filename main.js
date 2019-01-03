/*eslint no-console: "off"*/

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {read_config, parse_args} = require('./config');
const {readFile} = require('./utils');
const runner = require('./runner');
const render = require('./render');

function load_tests(args, tests_dir) {
    let test_names = (
        fs.readdirSync(tests_dir)
            .filter(n => n.endsWith('.js'))
            .map(n => n.substring(0, n.length - '.js'.length))
    );

    if (args.filter) {
        test_names = test_names.filter(n => new RegExp(args.filter).test(n));
    }

    return test_names.map(tn => {
        const tc = require(path.join(tests_dir, tn));
        tc.name = tn;
        return tc;
    });
}


// root_dir must contain the following directories:
// - tests/   runnable test files (*.js)
// - config/  with configuration files (*.json)
//
// Available options:
// - default_config: Function to call on the loaded configuration, to set/compute default values.
// - description: program description in the --help output
async function real_main(root_dir, options) {
    assert(root_dir, 'root_dir must be set');
    options = options || {};

    const args = parse_args(root_dir, options);
    const config = read_config(root_dir, args);
    if (options.default_config) {
        options.default_config(config);
    }
    const tests_dir = path.join(root_dir, 'tests');
    const test_cases = load_tests(args, tests_dir);

    if (args.list) {
        for (const tc of test_cases) {
            console.log(tc.name + (tc.description ? ` (${tc.description})` : ''));
        }
        return;
    }

    let results;
    if (args.load_json) {
        const json_input = await readFile(args.load_json, {encoding: 'utf-8'});
        results = JSON.parse(json_input);
    } else {
        // Run tests
        const test_info = await runner.run(config, test_cases);

        results = render.craft_results(config, test_info);
    }

    await render.do_render(config, results);

    const any_errors = results.tests.some(s => s.status === 'error');
    if (any_errors && !config.keep_open) {
        process.exit(3);
    }
}

function main(root_dir, options) {
    (async () => {
        try {
            await real_main(root_dir, options);
        } catch (e) {
            console.error(e.stack);
            process.exit(2);
        }
    })();
}

module.exports = {
    main,
};
