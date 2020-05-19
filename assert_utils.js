'use strict';
/**
 * Extensions to node's [assert module](https://nodejs.org/api/assert.html).
 * Feel free to use any other assert library, as long as it throws an exception if assertions
 * don't hold.
 * @packageDocumentation
 */

const assert = require('assert').strict;

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

module.exports = {
    assertLess,
    assertLessEqual,
    assertGreater,
    assertGreaterEqual,
    assertNumeric,
};
