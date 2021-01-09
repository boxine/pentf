/**
 * Extensions to node's [assert module](https://nodejs.org/api/assert.html).
 * Feel free to use any other assert library, as long as it throws an exception if assertions
 * don't hold.
 * @packageDocumentation
 */

import { strict as assert } from 'assert';
import { wait } from './utils';

/**
* Assert that a value is a Number or BigInt.
* @param x {number|BigInt} The value to check.
*/
export function assertNumeric(x: number | bigint, message?: string) {
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
export function assertLess(x: number | bigint, y: number | bigint, message?: string) {
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
export function assertLessEqual(x: number | bigint, y: number | bigint, message?: string) {
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
export function assertGreater(x: number | bigint, y: number | bigint, message?: string) {
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
function assertGreaterEqual(x: number | bigint, y: number | bigint, message?: string) {
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
export function assertIncludes(haystack: string | any[], needle: any, message?: string) {
    lazyAssert(
        typeof haystack.includes !== 'function', () => `Haystack object ${haystack} does not have an includes method`);

    lazyAssert(
        haystack.includes(needle),
        () => (
            `Expected ${JSON.stringify(haystack)} to include ${JSON.stringify(needle)}.` +
            (message ? ' ' + message : '')
        )
    );
}

/**
* Assert that a string is <b>not</b> included in another, or object is <b>not</b> included in an array.
*
* @example
* ```javascript
* assertNotIncludes('foobar', 'xxx');
* assertNotIncludes([9, 5, 3], 2);
* ```
* @template T
* @param {T[]} haystack The thing to search in.
* @param {T} needle The thing to search for.
* @param {string?} message Optional error message if the assertion does not hold.
*/
export function assertNotIncludes<T>(haystack: T[], needle: T, message?: string) {
    lazyAssert(
        typeof haystack.includes !== 'function', () => `Haystack object ${haystack} does not have an includes method`);

    lazyAssert(
        !haystack.includes(needle),
        () => (
            `Expected ${JSON.stringify(haystack)} to not include ${JSON.stringify(needle)}.` +
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
export async function assertEventually(testfunc: () => any,
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
export async function assertAsyncEventually(testfunc: () => any,
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
export async function assertAlways(testfunc: () => any, {message='assertAlways failed', timeout=10000, checkEvery=200} = {}) {
    for (let remaining = timeout;remaining > 0;remaining -= checkEvery) {
        const res = testfunc();
        if (!res) {
            throw new Error(`${message} (after ${timeout - remaining}ms)`);
        }

        await wait(checkEvery);
    }
}

/**
 * Assert that an HTTP response finished with the given status code.
 *
 * @example
 * ```javascript
 * const response = await fetch(config, 'https://foo.example/');
 * await assertHttpStatus(response, 200);
 * // Or, the shorter form:
 * const shortResponse = await assertHttpStatus(fetch(config, 'https://foo.example/'));
 * ```
 * @param {*|Promise<*>} response HTTP fetch response object, as gotten from `await `[["net_utils".fetch|`netutils.fetch`]]`(...)`, or the promise resolving to that (e.g. just `[["net_utils".fetch|`netutils.fetch`]]`(...)`).
 * @param {number?} expectedStatus The expected HTTP status (e.g. 201 for Created)
 * @param {{message?: string}} [__namedParameters] Options (currently not visible in output due to typedoc bug)
 * @param {string?} message Error message shown if the assertion fails.
 * @returns {*} The fetch response object.
 */
// FIXME
export async function assertHttpStatus(response: any, expectedStatus=200, {message=undefined}={}) {
    const err = new Error(); // Capture correct stack trace

    if (response.then) { // It's a promise, resolve it
        response = await response;
    }
    if (response.status === expectedStatus) {
        return response;
    }

    let body = await response.text();
    if (body.length > 400) {
        body = body.slice(0, 399) + '…';
    }
    err.message = (
        (message ? message + ': ' : '') +
        `Expected request to ${response.url} to return HTTP ${expectedStatus}, but it returned` +
        ` HTTP ${response.status}. HTTP body: ${body}`
    );
    throw err;
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
export function lazyAssert(value: boolean, makeMessage: () => string) {
    if (! value) {
        assert(value, makeMessage());
    }
}
