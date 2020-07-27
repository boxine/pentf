const fs = require('fs');
const path = require('path');
const glob = require('glob');
const {promisify} = require('util');

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

/**
 * @param {*} args 
 * @param {string} testsDir 
 * @param {string} [globPattern] 
 * @private
 */
async function loadTests(args, testsDir, globPattern = '*.js') {
    const testFiles = await promisify(glob.glob)(globPattern, {cwd: testsDir});
    let tests = testFiles.map(n => ({
        path: n,
        name: path.basename(n, path.extname(n)),
    }));

    if (args.filter) {
        tests = tests.filter(n => new RegExp(args.filter).test(n.name));
    }
    if (args.filter_body) {
        const bodyFilterRe = new RegExp(args.filter_body);
        tests = (await Promise.all(tests.map(async test => {
            const filePath = path.join(testsDir, test.path);
            const contents = await promisify(fs.readFile)(filePath, {encoding: 'utf-8'});
            return bodyFilterRe.test(contents) ? test : null;
        }))).filter(t => t);
    }

    let canUseImport = await supportsImports();
    return await Promise.all(
        tests.map(async t => {
            const file = path.join(testsDir, t.path);

            let tc;
            if (canUseImport) {
                // Use dynamic import statement to be able to load both native esm
                // and commonjs modules.
                tc = await import(file);

                // If we're importing a commonjs file the exports will be defined
                // as an esm default export
                if (tc.default) {
                    tc = tc.default;
                }
            } else {
                tc = require(file);
            }

            // ESM modules are readonly, so we need to create our own writable
            // object.
            return {...tc, name: t.name};
        })
    );
}

module.exports = {
    loadTests,
    supportsImports,
};
