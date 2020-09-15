const fs = require('fs');
const path = require('path');
const glob = require('glob');
const {promisify} = require('util');
const {pathToFileURL} = require('url');
const lifecycle = require('./plugins/lifecycle');

/**
 * Check if the current running node version supports import statements.
 * Node doesn't have a native way to check for this.
 */
async function supportsImports() {
    let canUseImport = true;
    try {
        await import('./file-that-does-not-exist');
    } catch (err) {
        if (/Not\ssupported/.test(err.message)) {
            canUseImport = false;
        }
    }

    return canUseImport;
}

let canUseImport;

/**
 * Load module via CommonJS or ES Modules depending on the environment
 * @param {string} file
 */
async function importFile(file) {
    if (canUseImport === undefined) {
        canUseImport = await supportsImports();
    }

    // Only use import() for JavaScript files. Patching module
    // resolution of import() calls is still very experimental, so
    // tools like `ts-node´ need to keep using `require` calls.
    // Note that we still need to forward loading from `node_modules`
    // to `import()` regardless.
    if ((/\.[cm]?js$/.test(file) || !file.includes('.')) && canUseImport) {
        // Use dynamic import statement to be able to load both native esm
        // and commonjs modules.

        // If we have a an absolute path we need to convert it to a URL.
        // This is crucial for Windows support where paths are not valid
        // URL pathnames. The latter is supported by `import()` out of
        // the box.
        let urlOrModuleName = file;
        if (path.isAbsolute(file)) {
            urlOrModuleName = pathToFileURL(file).href;
        }

        const m = await import(urlOrModuleName);

        // If we're importing a commonjs file the exports will be defined
        // as an esm default export
        return m.default ? m.default : m;
    } else {
        return require(file);
    }
}

/**
 * @param {import('./config').Config} config
 * @param {Array<{name: string, fileName: string}>} tests
 */
async function applyTestFilters(config, tests) {
    if (config.filter) {
        tests = tests.filter(n => new RegExp(config.filter).test(n.name));
    }
    if (config.filter_body) {
        const bodyFilterRe = new RegExp(config.filter_body);
        tests = (await Promise.all(tests.map(async test => {
            const contents = await fs.promises.readFile(test.fileName, {encoding: 'utf-8'});
            return bodyFilterRe.test(contents) ? test : null;
        }))).filter(t => t);
    }

    return tests;
}

/**
 * @param {import('./config').Config} config
 * @param {string} globPattern
 * @returns {Promise<import('./runner').TestCase[]>}
 * @private
 */
async function loadTests(config, globPattern) {
    const testFiles = await promisify(glob.glob)(globPattern, {cwd: config.rootDir, absolute: true});

    const testCases = await lifecycle.onLoad(config, testFiles);

    return testCases;
}

module.exports = {
    applyTestFilters,
    importFile,
    loadTests,
    supportsImports,
};
