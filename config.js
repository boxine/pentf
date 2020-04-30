'use strict';

const argparse = require('argparse');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const utils = require('./utils');

class AutoWidthArgumentParser extends argparse.ArgumentParser {
    _getFormatter() {
        const options = {prog: this.prog};
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
        const m = /^(?![_.])([-_A-Za-z0-9.]+)\.json$/.exec(fn);
        return m && m[1];
    });

    return res;
}

function parseArgs(options) {
    const DEFAULT_HTML_NAME = 'results.html';
    const DEFAULT_JSON_NAME = 'results.json';
    const DEFAULT_MARKDOWN_NAME = 'results.md';
    const DEFAULT_PDF_NAME = 'results.pdf';

    const parser = new AutoWidthArgumentParser({
        description: options.description,
    });

    // General arguments
    const {configDir} = options;
    if (configDir) {
        assert.equal(typeof configDir, 'string');
        parser.addArgument(['-e', '--env'], {
            choices: listEnvs(configDir),
            defaultValue: 'local',
            help: 'The environment to test against. Default is %(defaultValue)s.',
        });
    }
    parser.addArgument(['--version'], {
        action: 'storeTrue',
        dest: 'print_version',
        help: 'Print version of tests and test framework and exit.',
    });

    const output_group = parser.addArgumentGroup({title: 'Output'});
    output_group.addArgument(['-v', '--verbose'], {
        action: 'storeTrue',
        help: 'Let tests output diagnostic details',
    });
    output_group.addArgument(['-q', '--quiet'], {
        action: 'storeTrue',
        help: 'Do not output test status',
    });
    output_group.addArgument(['--no-clear-line', '--ci'], {
        action: 'storeTrue',
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
        help:
            'Do not output error messages matching the regular expression. Example: -I "\\(TOC-[0-9]+\\)"',
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

    const results_group = parser.addArgumentGroup({title: 'Writing results to disk'});
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

    const selection_group = parser.addArgumentGroup({title: 'Test selection'});
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

    const email_group = parser.addArgumentGroup({title: 'Email'});
    email_group.addArgument(['--keep-emails'], {
        action: 'storeTrue',
        help: 'Keep generated emails instead of deleting them',
    });
    email_group.addArgument(['--email-verbose'], {
        action: 'storeTrue',
        help: 'Log all IMAP commands and responses',
    });

    const puppeteer_group = parser.addArgumentGroup({title: 'puppeteer browser test'});
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
            process.env.PENTF_GENERIC_HELP ? './screenshots' : '%(defaultValue)s'
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
        help:
            'Configure devtools to preserve logs and network requests upon navigation. Implies --devtools',
        action: 'storeTrue',
    });
    puppeteer_group.addArgument(['--extensions'], {
        help: 'Load unpacked browser extensions',
        action: 'append',
        nargs: '*',
        defaultValue: [],
        metavar: 'EXTENSION_DIR',
    });

    const runner_group = parser.addArgumentGroup({title: 'Test runner'});
    runner_group.addArgument(['-C', '--concurrency'], {
        metavar: 'COUNT',
        help:
            'Maximum number of tests to run in parallel. 0 to run without a pool, sequentially. Defaults to %(defaultValue)s.',
        dest: 'concurrency',
        defaultValue: 10,
        type: 'int',
    });
    runner_group.addArgument(['-S', '--sequential'], {
        help: 'Do not run tests in parallel (same as -C 0)',
        dest: 'concurrency',
        action: 'storeConst',
        constant: 0,
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
        help:
            'Terminate with exit code 0 (success) even if tests fail. (Exit codes != 0 are still emitted in cases of internal crashes)',
        action: 'storeTrue',
    });

    const locking_group = parser.addArgumentGroup({title: 'Locking'});
    locking_group.addArgument(['-L', '--no-locking'], {
        help: 'Completely disable any locking of resources between tests.',
        action: 'storeTrue',
    });
    locking_group.addArgument(['--locking-verbose'], {
        help: 'Output status messages about locking',
        action: 'storeTrue',
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

    const args = parser.parseArgs();
    if (args.json_file !== DEFAULT_JSON_NAME && !args.json) {
        console.log('Warning: --json-file given, but not -j/--json. Will NOT write JSON.'); // eslint-disable-line no-console
    }
    if (args.markdown_file !== DEFAULT_MARKDOWN_NAME && !args.markdown) {
        console.log(
            'Warning: --markdown-file given, but not -m/--markdown. Will NOT write Markdown.'
        ); // eslint-disable-line no-console
    }
    if (args.html_file !== DEFAULT_HTML_NAME && !args.html) {
        console.log('Warning: --html-file given, but not -h/--html. Will NOT write HTML.'); // eslint-disable-line no-console
    }
    if (args.pdf_file !== DEFAULT_PDF_NAME && !args.pdf) {
        console.log('Warning: --pdf-file given, but not --pdf. Will NOT write PDF.'); // eslint-disable-line no-console
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
        parser.error('At the moment, --fail-fast does not work with locking. Pass in --no-locking');
    }

    return args;
}

function readConfigFile(configDir, env) {
    const config_fn = path.join(configDir, env + '.json');
    const config_json = fs.readFileSync(config_fn, 'utf-8');
    let config = JSON.parse(config_json);
    assert.equal(typeof config, 'object');

    if (config.extends) {
        config = {...readConfigFile(configDir, config.extends), ...config};
    }
    return config;
}

function readConfig(options, args) {
    const {configDir} = options;
    assert(configDir);
    const env = args.env;
    assert(env);

    const config = readConfigFile(configDir, env);
    config.beforeAllTests = options.beforeAllTests;
    config.afterAllTests = options.afterAllTests;
    if (args.override_external_locking_url) {
        config.external_locking_url = args.override_external_locking_url;
    }

    return {...config, ...args};
}

module.exports = {
    listEnvs,
    parseArgs,
    readConfig,
};
