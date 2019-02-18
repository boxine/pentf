'use strict';

const argparse = require('argparse');
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

function list_envs(root_dir) {
    const config_dir = path.join(root_dir, 'config');
    const all_files = fs.readdirSync(config_dir);
    const res = utils.filter_map(all_files, fn => {
        const m = /^(?!common)(?!\.)([_A-Za-z0-9.]+)\.json$/.exec(fn);
        return m && m[1];
    });

    return res;
}

// options can have the following optional values
// - description: program description in the --help output
function parse_args(root_dir, options) {
    const DEFAULT_HTML_NAME = 'results.html';
    const DEFAULT_JSON_NAME = 'results.json';
    const DEFAULT_MARKDOWN_NAME = 'results.md';
    const DEFAULT_PDF_NAME = 'results.pdf';

    const parser = new AutoWidthArgumentParser({
        description: options.description,
    });

    // General arguments
    parser.addArgument(['-e', '--env'], {
        choices: list_envs(root_dir),
        defaultValue: 'local',
        help: 'The environment to test against. Default is %(defaultValue)s.',
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
    output_group.addArgument(['--print-config'], {
        action: 'storeTrue',
        help: 'Output the effective configuration and exit.',
    });
    output_group.addArgument(['-c', '--print-curl'], {
        action: 'storeTrue',
        help: 'Print curl commands for each HTTP request',
    });
    output_group.addArgument(['-J', '--json'], {
        action: 'storeTrue',
        help: 'Write tests results as a JSON file.',
    });
    output_group.addArgument(['--json-file'], {
        metavar: 'FILE.json',
        dest: 'json_file',
        defaultValue: DEFAULT_JSON_NAME,
        help: 'JSON file to write to. Defaults to %(defaultValue)s .',
    });
    output_group.addArgument(['-H', '--html'], {
        action: 'storeTrue',
        help: 'Write tests results as an HTML file.',
    });
    output_group.addArgument(['--html-file'], {
        metavar: 'FILE.html',
        dest: 'html_file',
        defaultValue: DEFAULT_HTML_NAME,
        help: 'HTML file to write a report to. Defaults to %(defaultValue)s .',
    });
    output_group.addArgument(['--pdf'], {
        action: 'storeTrue',
        help: 'Write tests results as a PDF file.',
    });
    output_group.addArgument(['--pdf-file'], {
        metavar: 'FILE.pdf',
        dest: 'pdf_file',
        defaultValue: DEFAULT_PDF_NAME,
        help: 'PDF file to write a report to. Defaults to %(defaultValue)s .',
    });
    output_group.addArgument(['-M', '--markdown'], {
        action: 'storeTrue',
        help: 'Write tests results as a Markdown file.',
    });
    output_group.addArgument(['--markdown-file'], {
        metavar: 'FILE.md',
        dest: 'markdown_file',
        defaultValue: DEFAULT_MARKDOWN_NAME,
        help: 'Markdown file to write a report to. Defaults to %(defaultValue)s .',
    });
    output_group.addArgument(['--load-json'], {
        metavar: 'INPUT.json',
        help: 'Load test results from JSON (instead of executing tests)',
    });

    const selection_group = parser.addArgumentGroup({title: 'Test selection'});
    selection_group.addArgument(['-f', '--filter'], {
        metavar: 'REGEXP',
        help: 'Regular expression to match tests to run',
    });
    selection_group.addArgument(['-l', '--list'], {
        action: 'storeTrue',
        help: 'List all tests that would be run and exit',
    });

    const email_group = parser.addArgumentGroup({title: 'Email'});
    email_group.addArgument(['--keep-emails'], {
        action: 'storeTrue',
        help: 'Keep generated emails instead of deleting them',
    });
    email_group.addArgument(['--email-no-client-recycling'], {
        help: 'Create a new email client for every connection',
        dest: 'email_new_client',
        action: 'storeConst',
        constant: 'always',
    });

    const puppeteer_group = parser.addArgumentGroup({title: 'puppeteer browser test'});
    puppeteer_group.addArgument(['-V', '--visible'], {
        dest: 'headless',
        action: 'storeFalse',
        help: 'Make browser tests visible (i.e. not headless)',
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

    const runner_group = parser.addArgumentGroup({title: 'Test runner'});
    runner_group.addArgument(['-C', '--concurrency'], {
        metavar: 'COUNT',
        help: 'Maximum number of tests to run in parallel. 0 to run without a pool, sequentially. Defaults to %(defaultValue)s.',
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
    runner_group.addArgument(['-i', '--ignore-dependencies'], {
        help: 'Ignore test dependencies and just run them in any order',
        action: 'storeTrue',
    });

    const args = parser.parseArgs();
    if (args.json_file !== DEFAULT_JSON_NAME && !args.json) {
        console.log('Warning: --json-file given, but not -j/--json. Will NOT write JSON.'); // eslint-disable-line no-console
    }
    if (args.markdown_file !== DEFAULT_MARKDOWN_NAME && !args.markdown) {
        console.log('Warning: --markdown-file given, but not -m/--markdown. Will NOT write Markdown.'); // eslint-disable-line no-console
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

    return args;
}

function read_config(root_dir, args) {
    const env = args.env;
    const common_config_fn = path.join(root_dir, 'config', 'common.json');
    const common_config_json = fs.readFileSync(common_config_fn, 'utf-8');
    const common_config = JSON.parse(common_config_json);

    const config_fn = path.join(root_dir, 'config', env + '.json');
    const config_json = fs.readFileSync(config_fn, 'utf-8');
    const config = JSON.parse(config_json);

    return {...common_config, ...config, ...args};
}

module.exports = {
    list_envs,
    parse_args,
    read_config,
};
