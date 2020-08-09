const {transformAsync} = require('@babel/core');
const path = require('path');
const assert = require('assert').strict;

/**
 * @param {string} input
 * @param {string} expected
 * @param {{extension?: string}} [options]
 */
async function assertTranspile(input, expected, options = {}) {
    const result = await transformAsync(input, {
        babelrc: false,
        plugins: [[path.join(__dirname, '../babel-transform-commonjs-to-esm.js'), options]],
    });
    assert.equal(result.code, expected);
}

async function run() {
    // Removes useStrict directive
    await assertTranspile("'use strict';", '');

    await assertTranspile(
        `
        const { foo } = require('foo');

        function bar() {
            return foo();
        }

        module.exports = {
            bar,
        };
    `,
        `import { foo } from 'foo';
export function bar() {
  return foo();
}`
    );

    await assertTranspile(
        `
        const foo = require('foo');

        function bar() {
            return foo();
        }

        module.exports = {
            bar,
        };
    `,
        `import * as __foo from 'foo';
const foo = __foo.default || __foo;
export function bar() {
  return foo();
}`
    );

    await assertTranspile(
        `
        const {foo} = require('foo');

        module.exports = {
            foo,
        };
    `,
        `import { foo } from 'foo';
export { foo };`
    );

    await assertTranspile(
        `
        const {foo} = require('foo');

        module.exports = {
            foo,
        };
    `,
        `import { foo } from 'foo';
export { foo };`
    );

    // Append extension to relative imports
    await assertTranspile(
        `
        const {foo} = require('foo');
        const {bar} = require('./bar');

        function baz() {
            return foo() + bar();
        }
        module.exports = {
            baz,
        };
    `,
        `import { foo } from 'foo';
import { bar } from "./bar.mjs";
export function baz() {
  return foo() + bar();
}`,
        {extension: '.mjs'}
    );
}

module.exports = {
    run,
    description: 'Transpile CommonJS to ES Modules',
};
