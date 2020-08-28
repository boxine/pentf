'use strict';
/**
 * Extensions to node's [assert module](https://nodejs.org/api/assert.html).
 * Feel free to use any other assert library, as long as it throws an exception if assertions
 * don't hold.
 * @packageDocumentation
 */

const assert = require('assert').strict;

const {wait} = require('./utils');

/**
* Assert that a value is a Number or BigInt.
* @param x {number|BigInt} The value to check.
*/
function assertNumeric(x, message = undefined) {
    assert(
        ['number', 'bigint'].includes(typeof x),
        `${x} is not a number, but ${typeof x}.` + (message ? ' ' + message : ''));
}

/**
* Assert `x < y`.
* @param {number|BigInt} x The ostensibly smaller value.
* @param {number|BigInt} y The ostensibly larger value.
* @param {string?} message Optional error message if the assertion does not hold.
*/
function assertLess(x, y, message = undefined) {
    assertNumeric(x);
    assertNumeric(y);
    assert(!Number.isNaN(x));
    assert(!Number.isNaN(y));
    assert(x < y, `Expected ${x} < ${y}.` + (message ? ' ' + message : ''));
}

/**
* Assert `x <= y`.
* @param {number|BigInt} x The ostensibly smaller or equal value.
* @param {number|BigInt} y The ostensibly larger or equal value.
* @param {string?} message Optional error message if the assertion does not hold.
*/
function assertLessEqual(x, y, message = undefined) {
    assertNumeric(x);
    assertNumeric(y);
    assert(!Number.isNaN(x));
    assert(!Number.isNaN(y));
    assert(x <= y, `Expected ${x} <= ${y}.` + (message ? ' ' + message : ''));
}

/**
* Assert `x < y`.
* @param {number|BigInt} x The ostensibly larger value.
* @param {number|BigInt} y The ostensibly smaller value.
* @param {string?} message Optional error message if the assertion does not hold.
*/
function assertGreater(x, y, message = undefined) {
    assertNumeric(x);
    assertNumeric(y);
    assert(!Number.isNaN(x));
    assert(!Number.isNaN(y));
    assert(x > y, `Expected ${x} > ${y}.` + (message ? ' ' + message : ''));
}

/**
* Assert `x >= y`.
* @param {number|BigInt} x The ostensibly smaller or equal value.
* @param {number|BigInt} y The ostensibly larger or equal value.
* @param {string?} message Optional error message if the assertion does not hold.
*/
function assertGreaterEqual(x, y, message = undefined) {
    assertNumeric(x);
    assertNumeric(y);
    assert(!Number.isNaN(x));
    assert(!Number.isNaN(y));
    assert(x >= y, `Expected ${x} >= ${y}.` + (message ? ' ' + message : ''));
}

/**
* Assert that a string is included in another, or object is included in an array.
*
* @example
* ```javascript
* assertIncludes('foobar', 'foo');
* assertIncludes([9, 5, 3], 5);
* ```
* @param {string|array} haystack The thing to search in.
* @param {string|array} needle The thing to search for.
* @param {string?} message Optional error message if the assertion does not hold.
*/
function assertIncludes(haystack, needle, message = undefined) {
    lazyAssert(
        haystack.includes, () => `Haystack object ${haystack} does not have an includes method`);

    lazyAssert(
        haystack.includes(needle),
        () => (
            `Expected ${JSON.stringify(haystack)} to include ${JSON.stringify(needle)}.` +
            (message ? ' ' + message : '')
        )
    );
}

/**
 * Assert that a condition is eventually true.
 *
 * @example
 * ```javascript
 * let called = false;
 * setTimeout(() => {called = true;}, 2000);
 * await assertEventually(() => called);
 * ```
 * @param {() => any} testfunc The test function. Must return `true` to signal success.
 * @param {{message?: string, timeout?: number, checkEvery?: number, crashOnError?: boolean}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} message Error message shown if the condition never becomes true within the timeout.
 * @param {number?} timeout How long to wait, in milliseconds.
 * @param {number?} checkEvery Intervals between checks, in milliseconds.
 * @param {boolean?} crashOnError `true` (default): A thrown error/exception is an immediate failure.
 *                                `false`: A thrown error/exception is treated as if the test function returned false.
 */
async function assertEventually(testfunc,
    {message='assertEventually failed', timeout=10000, checkEvery=200, crashOnError=true} = {}) {

    for (let remaining = timeout;remaining > 0;remaining -= checkEvery) {
        if (crashOnError) {
            const res = await testfunc();
            if (res) return res;
        } else {
            let crashed = false;
            let res;
            try {
                res = await testfunc();
            } catch (e) {
                crashed = true;
            }
            if (!crashed) return res;
        }

        await wait(checkEvery);
    }
    throw new Error(`${message} (waited ${timeout}ms)`);
}

/**
 * Assert that an asynchronously evaluated condition is eventually true.
 *
 * @param {() => Promise<any>} testfunc The async test function. Must return `true` to signal success.
 * @param {{message?: string, timeout?: number, checkEvery?: number, crashOnError?: boolean}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} message Error message shown if the condition never becomes true within the timeout.
 * @param {number?} timeout How long to wait, in milliseconds.
 * @param {number?} checkEvery Intervals between checks, in milliseconds.
 * @param {boolean?} crashOnError `true` (default): A thrown error/exception is an immediate failure.
 *                                `false`: A thrown error/exception is treated as if the test function returned false.
 */
async function assertAsyncEventually(testfunc,
    {message='assertAsyncEventually failed', timeout=10000, checkEvery=200, crashOnError=true} = {}) {

    for (let remaining = timeout;remaining > 0;remaining -= checkEvery) {
        if (crashOnError) {
            const res = await testfunc();
            if (res) return res;
        } else {
            let crashed = false;
            let res;
            try {
                res = await testfunc();
            } catch (e) {
                crashed = true;
            }
            if (!crashed) return res;
        }

        await wait(checkEvery);
    }
    throw new Error(`${message} (waited ${timeout}ms)`);
}

/**
 * Assert that a condition remains true for the whole timeout.
 *
 * @param {() => any} testfunc The test function. Must return `true` to signal success.
 * @param {{message?: string, timeout?: number, checkEvery?: number}}  [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} message Error message shown if the testfunc fails.
 * @param {number?} timeout How long to wait, in milliseconds.
 * @param {number?} checkEvery Intervals between checks, in milliseconds.
*/
async function assertAlways(testfunc, {message='assertAlways failed', timeout=10000, checkEvery=200} = {}) {
    for (let remaining = timeout;remaining > 0;remaining -= checkEvery) {
        const res = testfunc();
        if (!res) {
            throw new Error(`${message} (after ${timeout - remaining}ms)`);
        }

        await wait(checkEvery);
    }
}

/**
 * Assert function with a message that is generated on demand.
 * @example
 * ```javascript
 * lazyAssert(obj?.foo?.bar, () => `Object is missing foo.bar. Full object: ${JSON.stringify(obj)}`);
 * ```
 * @param {boolean} value The value to be asserted to be true.
 * @param {() => string} makeMessage Function to generate the error message, should the value be false.
*/
function lazyAssert(value, makeMessage) {
    if (! value) {
        assert(value, makeMessage());
    }
}

module.exports = {
    assertAlways,
    assertAsyncEventually,
    assertEventually,
    assertGreater,
    assertGreaterEqual,
    assertIncludes,
    assertLess,
    assertLessEqual,
    assertNumeric,
    lazyAssert,
};
