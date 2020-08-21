import { TaskConfig, TestCase } from './runner';

import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import {promisify} from 'util';
import {pathToFileURL} from 'url';

/**
 * Check if the current running node version supports import statements.
 * Node doesn't have a native way to check for this.
 */
async function supportsImports() {
    let canUseImport = true;
    try {
        // @ts-ignore
        await import('./file-that-does-not-exist');
    } catch (err) {
        if (/Not\ssupported/.test(err.message)) {
            canUseImport = false;
        }
    }

    return canUseImport;
}

let canUseImport: boolean | undefined;

/**
 * Load module via CommonJS or ES Modules depending on the environment
 */
export async function importFile(file: string) {
    if (canUseImport === undefined) {
        canUseImport = await supportsImports();
    }

    if (canUseImport) {
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

export type TestOptions = Omit<TestCase, 'name' | 'run'>;

export interface TestFn {
  (name: string, test: () => any, options?: TestOptions): void;
  only: (name: string, test: (config: TaskConfig) => Promise<void | void>, options?: TestOptions) => void;
  skip: (name: string, test: (config: TaskConfig) => Promise<void | void>, options?: TestOptions) => void;
}

export interface DescribeFn {
    (name: string, callback: () => void): void;
    only: (name: string, callback: () => void) => void;
    skip: (name: string, callback: () => void) => void;
}

export type SuiteBuilder = (test: TestFn, suite: DescribeFn) => void;

/**
 * @private
 */
export function loadSuite(suiteName: string, builder: SuiteBuilder) {
    const tests = [];
    const only = [];
    let onlyInScope = false;
    let skipInScope = false;
    const groups = [suiteName];
    let i = 0;

    const skipFn = () => true;

    /**
     * Create a test case
     */
    const test: TestFn = (description, run, options = {}) => {
        const arr = onlyInScope ? only : tests;
        arr.push({
            description,
            name: `${groups.join('>')}_${i++}`,
            run,
            skip: skipInScope ? skipFn : options.skip,
            ...options,
        });
    }

    /**
     * Only run this test case in the current file
     */
    test.only = (description, run, options = {}) => {
        only.push({
            description,
            name: `${groups.join('>')}_${i++}`,
            run,
            skip: skipInScope ? skipFn : options.skip,
            ...options,
        });
    };

    /**
     * Skip this test case
     */
    test.skip = (description, run, options = {}) => {
        const arr = onlyInScope ? only : tests;
        arr.push({
            description,
            name: `${groups.join('>')}_${i++}`,
            run,
            skip: skipFn,
            ...options,
        });
    };

    /**
     * Create a group for test cases
     */
    const describe: DescribeFn = (description, callback) => {
        groups.push(description);
        callback();
        groups.pop();
    }

    /**
     * Only run the test cases inside this group
     */
    describe.only = (description, callback) => {
        onlyInScope = true;
        groups.push(description);

        callback();

        onlyInScope = false;
        groups.pop();
    };

    /**
     * Skip this group of test cases
     */
    describe.skip = (description, callback) => {
        skipInScope = true;
        groups.push(description);

        callback();

        skipInScope = false;
        groups.pop();
    };

    builder(test, describe);
    return only.length > 0 ? only : tests;
}

/**
 * @param {*} args
 * @param {string} testsDir
 * @param {string} [globPattern]
 * @private
 */
export async function loadTests(args, testsDir: string, globPattern = '*.{js,cjs,mjs}') {
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

    const testCases: TestCase[] = [];
    await Promise.all(
        tests.map(async t => {
            const file = path.join(testsDir, t.path);

            let tc = await importFile(file);

            if (typeof tc.suite === 'function') {
                testCases.push(...loadSuite(t.name, tc.suite));
            } else {
                // ESM modules are readonly, so we need to create our own writable
                // object.
                testCases.push({...tc, name: t.name});
            }
        })
    );

    return testCases;
}
