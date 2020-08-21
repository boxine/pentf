/*eslint no-console: "off"*/

import * as fs from 'fs';
import * as path from 'path';

import {readConfig, parseArgs, Config} from './config';
import {readFile, localIso8601} from './utils';
import * as runner from './runner';
import * as render from './render';
import {color, logVerbose} from './output';
import {testsVersion, pentfVersion} from './version';
import {loadTests} from './loader';

export interface PentfOptions extends Pick<Config, 'beforeAllTests' | 'afterAllTests'>{
    /** Function to call on the loaded configuration, to set/compute default values. */
    defaultConfig?: (config: Config) => Config;
    /** program description in the --help output */
    description?: string;
    /** Root directory (assume tests/ contains tests, config/ if exists contains config) */
    rootDir?: string;
    /** Test directory */
    testsDir?: string;
    /** Configuration directory. false disables configuration. */
    configDir?: string | false;
}

async function real_main(options: PentfOptions={}) {
    if (options.rootDir) {
        if (! options.testsDir) {
            options.testsDir = path.join(options.rootDir, 'tests');
        }
        if (! options.configDir) {
            const autoConfigDir = path.join(options.rootDir, 'config');
            if (fs.existsSync(autoConfigDir)) {
                options.configDir = autoConfigDir;
            }
        }
    }


    const args = parseArgs(options, process.argv.slice(2));
    const config = await readConfig(options, args);
    if (options.defaultConfig) {
        options.defaultConfig(config);
    }

    if (!config.colors) {
        // Trick other libraries (e.g. node's assert.strict) into not using colors
        process.env.NODE_DISABLE_COLORS = 'true';
    }

    const test_cases = await loadTests(args, options.testsDir!, config.testsGlob || options.testsGlob);
    config._testsDir = options.testsDir;
    if (options.rootDir) config._rootDir = options.rootDir;
    if (options.configDir) config._configDir = options.configDir;

    if (args.print_version) {
        console.log(await testsVersion(config));
        console.log('pentf ' + pentfVersion());
        return;
    }

    // Argparse wraps argument lists with another array
    if (config.extensions.length) {
        config.extensions = config.extensions
            .reduce((acc, item) => acc.concat(item), [] as any);
    }

    if (args.list) {
        for (const tc of test_cases) {
            let description = '';
            if (tc.description) {
                description = (
                    ' ' + (config.colors ? '' : '(') +
                    color(config, 'dim', tc.description) +
                    (config.colors ? '' : ')')
                );
            }

            console.log(color(config, 'white', tc.name) + description);
        }
        return;
    }

    if (args.print_config) {
        console.log(config);
        return;
    }

    let results;
    if (args.load_json) {
        const json_input = await readFile(args.load_json, {encoding: 'utf-8'} as any);
        results = JSON.parse(json_input as any);
    } else {
        if (config.log_file && !config.log_file_stream) {
            const stream = fs.createWriteStream(config.log_file, { flags: 'w' });
            const time = localIso8601();
            stream.write(`${time} Start runner\n`);
            config.log_file_stream = stream;
        }

        // Run tests
        const test_info = await runner.run(config, test_cases);
        if (!test_info) return;

        results = render.craftResults(config, test_info);
    }

    await render.doRender(config, results);
    if (!config.keep_open) {
        const anyErrors = results.tests.some(s => s.status === 'error' && !s.expectedToFail);
        const retCode = (!anyErrors || config.exit_zero) ? 0 : 3;
        logVerbose(`Terminating with exit code ${retCode}`);
        process.exit(retCode);
    }
}

function main(options) {
    (async () => {
        try {
            await real_main(options);
        } catch (e) {
            console.error(e.stack);
            process.exit(2);
        }
    })();
}

module.exports = {
    main,
};
