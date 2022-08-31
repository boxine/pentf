'use strict';

const argparse = require('argparse');
const assert = require('assert').strict;
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const utils = require('./utils');
const { importFile, findPackageJson } = require('./loader');

class AutoWidthArgumentParser extends argparse.ArgumentParser {
    _getFormatter() {
        const options = { prog: this.prog };
        if (process.env.COLUMNS) {
            options.width = parseInt(process.env.COLUMNS);
        } else if (process.stdout.getWindowSize) {
            options.width = process.stdout.getWindowSize()[0];
        }
        return new this.formatterClass(options);
    }
}

function listEnvs(configDir) {
    const allFiles = fs.readdirSync(configDir);
    const res = utils.filterMap(allFiles, fn => {
        const m = /^(?![_.])([-_A-Za-z0-9.]+)\.(?:json|js)$/.exec(fn);
        return m && m[1];
    });

    return res;
}

function getCPUCount() {
    return os.cpus().length;
    // TODO handle scenarios where our process is limited to less
}

function _parseConcurrencyFormula(spec, cpuCount) {
    if (spec.includes('+')) {
        return spec
            .split('+')
            .map(subSpec => _parseConcurrencyFormula(subSpec, cpuCount))
            .reduce((x, y) => x + y, 0);
    }
    if (spec.includes('-')) {
        const parts = spec
            .split('-')
            .map(subSpec => _parseConcurrencyFormula(subSpec, cpuCount));
        return parts
            .slice(1)
            .reduce((total, element) => total - element, parts[0]);
    }
    if (spec.includes('*')) {
        return spec
            .split('*')
            .map(subSpec => _parseConcurrencyFormula(subSpec, cpuCount))
            .reduce((x, y) => x * y, 1);
    }

    spec = spec.trim();
    if (spec === 'cpus') {
        return cpuCount;
    }
    assert(
        /^-?[0-9]+$/.test(spec),
        `Invalid concurrency spec ${JSON.stringify(spec)}`
    );
    return parseInt(spec);
}

function computeConcurrency(spec, { cpuCount = undefined } = {}) {
    if (typeof spec === 'number') {
        // Somebody passed in result value directly
        return spec;
    }
    if (cpuCount === undefined) {
        cpuCount = getCPUCount();
    }

    if (spec.trim() === '0') {
        return 0; // sequential run desired
    }

    const res = Math.max(_parseConcurrencyFormula(spec, cpuCount), 1);
    assert(!isNaN(res));
    return res;
}

function parseArgs(options, raw_args) {
    const DEFAULT_HTML_NAME = 'results.html';
    const DEFAULT_JSON_NAME = 'results.json';
    const DEFAULT_MARKDOWN_NAME = 'results.md';
    const DEFAULT_PDF_NAME = 'results.pdf';

    const parser = new AutoWidthArgumentParser({
        description: options.description,
    });

    // General arguments
    parser.addArgument(['--version'], {
        action: 'storeTrue',
        dest: 'print_version',
        help: 'Print version of tests and test framework and exit.',
    });

    const config_group = parser.addArgumentGroup({ title: 'Configuration' });
    const { configDir } = options;
    if (configDir) {
        assert.equal(typeof configDir, 'string');
        config_group.addArgument(['-e', '--env'], {
            choices: listEnvs(configDir),
            defaultValue: 'local',
            help: 'The environment to test against. Default is %(defaultValue)s.',
        });
    }
    config_group.addArgument(['--config'], {
        type: 'string',
        metavar: 'FILE',
        dest: 'config_file',
        defaultValue: 'pentf.config.js',
        help: 'Path to config file. (Default: pentf.config.js)',
    });
    config_group.addArgument(['--set-config'], {
        metavar: 'key.subkey=JSON',
        dest: 'set_config',
        action: 'append',
        help: 'Set a configuration option, e.g. imap.user="test@dev.example"',
    });

    const output_group = parser.addArgumentGroup({ title: 'Output' });
    output_group.addArgument(['-v', '--verbose'], {
        action: 'storeTrue',
        help: 'Let tests output diagnostic details',
    });
    output_group.addArgument(['--log-file'], {
        help: "Write verbose log information to disk. Doesn't affect tty logging.",
        metavar: 'FILE',
        type: 'string',
        dest: 'log_file',
    });
    output_group.addArgument(['-q', '--quiet'], {
        action: 'storeTrue',
        help: 'Do not output test status',
    });
    output_group.addArgument(['--no-clear-line', '--ci'], {
        action: 'storeTrue',
        dest: 'ci',
        help: 'Never clear the current output line (as if output is not a tty)',
    });
    output_group.addArgument(['--print-config'], {
        action: 'storeTrue',
        help: 'Output the effective configuration and exit.',
    });
    output_group.addArgument(['-c', '--print-curl'], {
        action: 'storeTrue',
        help: 'Print curl commands for each HTTP request',
    });
    output_group.addArgument(['-I', '--ignore-errors'], {
        metavar: 'REGEXP',
        help: 'Do not output error messages matching the regular expression. Example: -I "\\(TOC-[0-9]+\\)"',
    });
    output_group.addArgument(['-E', '--expect-nothing'], {
        action: 'storeTrue',
        help: 'Ignore expectedToFail attributes on tests',
    });
    output_group.addArgument(['--no-colors'], {
        action: 'storeFalse',
        dest: 'colors',
        help: 'Disable colors in stdout',
    });

    const results_group = parser.addArgumentGroup({
        title: 'Writing results to disk',
    });
    results_group.addArgument(['-J', '--json'], {
        action: 'storeTrue',
        help: 'Write tests results as a JSON file.',
    });
    results_group.addArgument(['--json-file'], {
        metavar: 'FILE.json',
        dest: 'json_file',
        defaultValue: DEFAULT_JSON_NAME,
        help: 'JSON file to write to. Defaults to %(defaultValue)s .',
    });
    results_group.addArgument(['-H', '--html'], {
        action: 'storeTrue',
        help: 'Write test results as an HTML file.',
    });
    results_group.addArgument(['--html-file'], {
        metavar: 'FILE.html',
        dest: 'html_file',
        defaultValue: DEFAULT_HTML_NAME,
        help: 'HTML file to write a report to. Defaults to %(defaultValue)s .',
    });
    results_group.addArgument(['--pdf'], {
        dest: 'explicit_pdf',
        action: 'storeTrue',
        help: 'Write test results as a PDF file. (Now enabled by default)',
    });
    results_group.addArgument(['--no-pdf'], {
        dest: 'pdf',
        action: 'storeFalse',
        help: 'Do not write a PDF report with test results.',
    });
    results_group.addArgument(['--pdf-file'], {
        metavar: 'FILE.pdf',
        dest: 'pdf_file',
        defaultValue: DEFAULT_PDF_NAME,
        help: 'PDF file to write a report to. Defaults to %(defaultValue)s .',
    });
    results_group.addArgument(['-M', '--markdown'], {
        action: 'storeTrue',
        help: 'Write tests results as a Markdown file.',
    });
    results_group.addArgument(['--markdown-file'], {
        metavar: 'FILE.md',
        dest: 'markdown_file',
        defaultValue: DEFAULT_MARKDOWN_NAME,
        help: 'Markdown file to write a report to. Defaults to %(defaultValue)s .',
    });
    results_group.addArgument(['--load-json'], {
        metavar: 'INPUT.json',
        help: 'Load test results from JSON (instead of executing tests)',
    });
    results_group.addArgument(['--sentry'], {
        action: 'storeConst',
        constant: true,
        dest: 'override_sentry',
        help:
            'Enable error reporting via Sentry.' +
            ' By default, this will be activated if the CI environment variable is set and a ' +
            ' SENTRY_DSN is configured.',
    });
    results_group.addArgument(['--no-sentry'], {
        action: 'storeConst',
        constant: false,
        dest: 'override_sentry',
        help: 'Disable error reporting via Sentry even if it is configured',
    });
    results_group.addArgument(['--sentry-dsn'], {
        dest: 'override_sentry_dsn',
        help: 'Override Sentry DSN. By default, the SENTRY_DSN environment variable is used.',
    });

    const selection_group = parser.addArgumentGroup({
        title: 'Test selection',
    });
    selection_group.addArgument(['-f', '--filter'], {
        metavar: 'REGEXP',
        help: 'Regular expression to match names of tests to run',
    });
    selection_group.addArgument(['-b', '--filter-body'], {
        metavar: 'REGEXP',
        help: 'Run only tests whose full code is matched by this regular expression',
    });
    selection_group.addArgument(['-l', '--list'], {
        action: 'storeTrue',
        help: 'List all tests that would be run and exit',
    });
    selection_group.addArgument(['-a', '--all', '--include-slow-tests'], {
        action: 'storeTrue',
        dest: 'include_slow_tests',
        help: 'Run tests that take a very long time',
    });
    selection_group.addArgument(['--tests-glob'], {
        dest: 'testsGlob',
        defaultValue: '*.{js,cjs,mjs}',
        help: 'Glob pattern to use when searching test files',
    });

    const email_group = parser.addArgumentGroup({ title: 'Email' });
    email_group.addArgument(['--keep-emails'], {
        action: 'storeTrue',
        help: 'Keep generated emails instead of deleting them',
    });
    email_group.addArgument(['--email-verbose'], {
        action: 'storeTrue',
        help: 'Log all IMAP commands and responses',
    });

    const puppeteer_group = parser.addArgumentGroup({
        title: 'puppeteer browser test',
    });
    puppeteer_group.addArgument(['-V', '--visible'], {
        dest: 'headless',
        action: 'storeFalse',
        help: 'Make browser tests visible (i.e. not headless)',
    });
    puppeteer_group.addArgument(['--no-screenshots'], {
        action: 'storeFalse',
        dest: 'take_screenshots',
        help: 'Do not take screenshots of browser failures',
    });
    const defaultScreenshotDir = path.join(
        options.rootDir ? options.rootDir : process.cwd(),
        'screenshots'
    );
    puppeteer_group.addArgument(['--screenshot-directory'], {
        metavar: 'DIR',
        defaultValue: defaultScreenshotDir,
        help: `Directory to write screenshots to (default: ${
            process.env.PENTF_GENERIC_HELP
                ? './screenshots'
                : '%(defaultValue)s'
        })`,
    });
    const defaultSnapshotDir = path.join(
        options.rootDir ? options.rootDir : process.cwd(),
        'snapshots'
    );
    puppeteer_group.addArgument(['--snapshot-directory'], {
        metavar: 'DIR',
        defaultValue: defaultSnapshotDir,
        help: `Directory to write snapshots to (default: ${
            process.env.PENTF_GENERIC_HELP ? './snapshots' : '%(defaultValue)s'
        })`,
    });
    puppeteer_group.addArgument(['-u', '--update-snapshots'], {
        help: 'Update existing snapshots on mismatch',
        action: 'storeTrue',
    });
    puppeteer_group.addArgument(['--video'], {
        action: 'storeTrue',
        dest: 'video',
        help: 'Record videos of browser pages for failed tests',
    });
    const defaultVideoDir = path.join(
        options.rootDir ? options.rootDir : process.cwd(),
        'videos'
    );
    puppeteer_group.addArgument(['--video-directory'], {
        metavar: 'DIR',
        defaultValue: defaultVideoDir,
        help: `Directory to write videos to (default: ${
            process.env.PENTF_GENERIC_HELP ? './videos' : '%(defaultValue)s'
        })`,
    });
    puppeteer_group.addArgument(['-s', '--slow-mo'], {
        metavar: 'MS',
        type: 'int',
        help: 'Wait this many milliseconds after every call to the virtual browser',
    });
    puppeteer_group.addArgument(['-k', '--keep-open'], {
        help: 'Keep browser sessions open in case of failures. Implies -V.',
        action: 'storeTrue',
    });
    puppeteer_group.addArgument(['--devtools'], {
        help: 'Start browser with devtools open. Implies -V',
        action: 'storeTrue',
    });
    puppeteer_group.addArgument(['--devtools-preserve'], {
        help: 'Configure devtools to preserve logs and network requests upon navigation. Implies --devtools',
        action: 'storeTrue',
    });
    puppeteer_group.addArgument(['--extensions'], {
        help: 'Load unpacked browser extensions',
        action: 'append',
        nargs: '*',
        defaultValue: [],
        metavar: 'EXTENSION_DIR',
    });
    puppeteer_group.addArgument(['--forward-console'], {
        help: 'Forward browser console logs',
        action: 'storeTrue',
    });
    puppeteer_group.addArgument(['--show-interactions'], {
        help: 'Visually show on the page where a user interaction took place (clicks, taps,...)',
        action: 'storeTrue',
    });
    puppeteer_group.addArgument(['-d', '--debug'], {
        help: 'Shorthand for "--keep-open --devtools-preserve --forward-console"',
        action: 'storeTrue',
    });
    puppeteer_group.addArgument(['--default-timeout'], {
        help: 'Default timeout value for various browser functions (default: 30s)',
        metavar: 'MS',
        type: 'int',
        defaultValue: 30000,
    });

    const runner_group = parser.addArgumentGroup({ title: 'Test runner' });
    const concurrency_default = 'cpus';
    runner_group.addArgument(['-C', '--concurrency'], {
        metavar: 'COUNT',
        help:
            'Maximum number of tests to run in parallel.' +
            ' 0 to run without a pool, sequentially.' +
            ' Can include *, +, and cpus for the number of CPUs.' +
            ' Defaults to ' +
            concurrency_default +
            '.',
        dest: 'concurrency',
    });
    runner_group.addArgument(['-S', '--sequential'], {
        help: 'Do not run tests in parallel (same as -C 0)',
        dest: 'sequential',
        action: 'storeTrue',
    });
    runner_group.addArgument(['--fail-fast'], {
        help: 'Abort once a test fails',
        action: 'storeTrue',
    });
    runner_group.addArgument(['--print-tasks'], {
        help: 'Output all tasks that the runner would perform, and exit',
        action: 'storeTrue',
    });
    runner_group.addArgument(['--exit-zero'], {
        help: 'Terminate with exit code 0 (success) even if tests fail. (Exit codes != 0 are still emitted in cases of internal crashes)',
        action: 'storeTrue',
    });
    runner_group.addArgument(['--repeat'], {
        type: 'int',
        metavar: 'COUNT',
        defaultValue: 1,
        help: 'Run the tests the specified number of times',
    });
    runner_group.addArgument(['--repeat-flaky'], {
        type: 'int',
        metavar: 'COUNT',
        defaultValue: 0,
        help: 'Repeat a failing test until it passes or the specified run count limit is reached',
        dest: 'repeatFlaky',
    });
    runner_group.addArgument(['--timeout'], {
        type: 'int',
        metavar: 'MS',
        dest: 'timeout',
        help: 'Set a maximum duration for a test case in ms before timing out. (Default: 1h)',
    });
    runner_group.addArgument(['--status-interval'], {
        type: 'int',
        metavar: 'MS',
        dest: 'status_interval',
        help: 'Interval in MS to print a detailed list of the current runner state.',
    });
    runner_group.addArgument(['-w', '--watch'], {
        help: 'Re-run tests if a test file changes.',
        action: 'storeTrue',
    });
    runner_group.addArgument(['--watch-files'], {
        help: 'Listen for these additional files in watch mode.',
        action: 'append',
        nargs: '*',
    });

    const locking_group = parser.addArgumentGroup({ title: 'Locking' });
    locking_group.addArgument(['-L', '--no-locking'], {
        help: 'Completely disable any locking of resources between tests.',
        action: 'storeTrue',
    });
    locking_group.addArgument(['--locking-verbose'], {
        help: 'Output status messages about locking',
        action: 'storeTrue',
        dest: 'locking_verbose',
    });
    locking_group.addArgument(['--list-conflicts'], {
        help: 'Show which tasks conflict on which resources, and exit immediately',
        action: 'storeTrue',
    });
    locking_group.addArgument(['--manually-lock'], {
        metavar: 'RESOURCES',
        help: 'Externally lock the specified comma-separated resources for 60s before the test',
    });
    locking_group.addArgument(['--list-locks', '--list-external-locks'], {
        help: 'List (external) locks and exit',
        action: 'storeTrue',
    });
    locking_group.addArgument(['--clear-locks', '--clear-external-locks'], {
        help: 'Clear all external locks and exit',
        dest: 'clear_external_locks',
        action: 'storeTrue',
    });
    locking_group.addArgument(['--no-external-locking'], {
        help: 'Disable external locking (via a lockserver)',
        action: 'storeTrue',
    });
    locking_group.addArgument(['--external-locking-url'], {
        metavar: 'URL',
        help: 'Override URL of lockserver',
        dest: 'override_external_locking_url',
    });
    locking_group.addArgument(['--display-locking-client'], {
        action: 'storeTrue',
        help: 'Display the locking client ID we would use if we would lock something now',
    });

    const args = parser.parseArgs(raw_args);

    // Overwrite config object passed to `pentf.main()` with command line
    // arguments. But only overwrite any existing config properties passed
    // to `pentf.main()` if they were actually set via the cli. If the
    // property doesn't exist in the existing config and we didn't specify
    // it as a cli argument, we'll use the default value.
    for (const k in parser._actions) {
        const flag = parser._actions[k];
        if (flag.dest in options && args[flag.dest] === flag.defaultValue) {
            args[flag.dest] = options[flag.dest];
        }
    }

    if (args.json_file !== DEFAULT_JSON_NAME && !args.json) {
        console.log(
            'Warning: --json-file given, but not -j/--json. Will NOT write JSON.'
        ); // eslint-disable-line no-console
    }
    if (args.markdown_file !== DEFAULT_MARKDOWN_NAME && !args.markdown) {
        console.log(
            'Warning: --markdown-file given, but not -m/--markdown. Will NOT write Markdown.'
        ); // eslint-disable-line no-console
    }
    if (args.html_file !== DEFAULT_HTML_NAME && !args.html) {
        console.log(
            'Warning: --html-file given, but not -h/--html. Will NOT write HTML.'
        ); // eslint-disable-line no-console
    }
    if (args.pdf_file !== DEFAULT_PDF_NAME && !args.pdf) {
        console.log(
            'Warning: --pdf-file given, but not --pdf. Will NOT write PDF.'
        ); // eslint-disable-line no-console
    }

    if (args.debug) {
        args.devtools_preserve = true;
        args.keep_open = true;
        args.forward_console = true;
        args.show_interactions = true;
    }
    if (args.keep_open) {
        args.headless = false;
    }
    if (args.devtools_preserve) {
        args.devtools = true;
    }
    if (args.devtools) {
        args.headless = false;
    }

    if (args.fail_fast && !args.no_locking) {
        parser.error(
            'At the moment, --fail-fast does not work with locking. Pass in --no-locking'
        );
    }

    let concurrency_spec = args.concurrency;
    if (args.sequential) {
        if (args.concurrency) {
            parser.error(
                'Cannot use -C/-concurrency and -S/--sequential at the same time!'
            );
        }
        concurrency_spec = 0;
    } else if (concurrency_spec === null) {
        if (args.watch) {
            // Watch mode is typically used for local development. In that case
            // we need to keep some cores available for other stuff like
            // a bundler and/or unit test runner for frontend developers.
            concurrency_spec = 'cpus - 2';
        } else {
            concurrency_spec = concurrency_default;
        }
    }
    args.concurrency = computeConcurrency(concurrency_spec);

    // argpase returns a nested array
    args.watch_files = args.watch_files ? args.watch_files[0] : [];

    return args;
}

async function readConfigFile(configDir, env, moduleType) {
    let config;

    const jsFilename = path.join(configDir, env + '.js');
    if (await promisify(fs.exists)(jsFilename)) {
        config = await importFile(jsFilename, moduleType);

        if (typeof config == 'function') {
            config = await config(env);
        }
    } else {
        const jsonFilename = path.join(configDir, env + '.json');
        const config_json = await promisify(fs.readFile)(jsonFilename, 'utf-8');
        config = JSON.parse(config_json);
    }
    assert.equal(typeof config, 'object');

    if (config.extends) {
        config = {
            ...(await readConfigFile(configDir, config.extends, moduleType)),
            ...config,
        };
    }
    return config;
}

/**
 * @typedef {{config_file: string, no_external_locking?: boolean, no_locking?: boolean, locking_verbose?: boolean, external_locking_client?: string, external_locking_url?: string, expect_nothing?: boolean, log_file?: string, log_file_stream?: fs.WriteStream, repeatFlaky: number, concurrency: number, watch: boolean, watch_files?: string, testsGlob: string, moduleType: "commonjs" | "esm", show_interactions?: boolean, snapshot_directory: string, update_snapshots?: boolean, video?: boolean, video_directory: string}} Config
 */

/**
 * @param {import('./main').PentfOptions} options
 * @param {object} args
 * @returns {Config}
 */
async function readConfig(options, args) {
    const { configDir } = options;

    let config = args;

    Object.keys(options).forEach(key => {
        if (!(key in config)) {
            config[key] = options[key];
        }
    });

    config.rootDir = options.rootDir || process.cwd();

    // Add support for `pentf` configuration key in `package.json`.
    const pkgJsonPath = await findPackageJson(config.rootDir);
    let moduleType = 'commonjs';
    if (pkgJsonPath !== null) {
        const pkgJson = JSON.parse(await fs.promises.readFile(pkgJsonPath));
        config = pkgJson.pentf || config;
        if (pkgJson.type === 'module') moduleType = 'esm';
    }

    // "pentf.config.js" configuration file
    if (args.config_file) {
        const configPath = path.join(config.rootDir, args.config_file);
        if (await promisify(fs.exists)(configPath)) {
            const res = await importFile(configPath, moduleType);
            const data = typeof res === 'function' ? res(args.env) : res;
            config = { ...config, ...data };
        }
    }

    if (configDir) {
        const env = args.env;
        assert(env);
        config = await readConfigFile(configDir, env, moduleType);
    }
    config.beforeAllTests = options.beforeAllTests;
    config.afterAllTests = options.afterAllTests;
    if (args.override_external_locking_url) {
        config.external_locking_url = args.override_external_locking_url;
    }

    // Configure Sentry
    config.sentry_dsn =
        args.override_sentry_dsn || config.sentry_dsn || process.env.SENTRY_DSN;
    if (args.override_sentry !== null) {
        config.sentry = args.override_sentry;
    } else if (process.env.CI && config.sentry_dsn) {
        config.sentry = true;
    }

    config.moduleType = moduleType;

    const res = { ...config, ...args };

    for (const set_config of args.set_config || []) {
        const m = /^([^=]+)=(.*)$/.exec(set_config);
        if (!m) {
            throw new Error(
                `Cannot parse -set-config option ${set_config}, should be like key.subkey=json`
            );
        }

        const keys = m[1].split('.');
        const value = JSON.parse(m[2]);
        const parentKeys = keys.slice(0, keys.length - 1);
        const finalKey = keys[keys.length - 1];

        let to_modify = res;
        for (const k of parentKeys) {
            if (to_modify[k] === undefined) {
                to_modify[k] = {};
            }
            to_modify = to_modify[k];
        }

        to_modify[finalKey] = value;
    }

    return res;
}

module.exports = {
    listEnvs,
    parseArgs,
    readConfig,
    getCPUCount,
    // tests only
    _readConfigFile: readConfigFile,
    _computeConcurrency: computeConcurrency,
};
