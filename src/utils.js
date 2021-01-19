const assert = require('assert').strict;

function makeEmailAddress(config, suffix) {
    assert(config.email, 'Missing `email` key in pentf configuration');
    const [account, domain] = config.email.split('@');
    const localPath = `${account}+${suffix}`;

    // See: https://stackoverflow.com/questions/386294/what-is-the-maximum-length-of-a-valid-email-address
    assert(
        localPath.length <= 64,
        `Error: invalid email address: ${localPath}.\n\n` +
            'The local-part (= part before the @ sign) MUST not be longer than 64 characters.'
    );

    return localPath + '@' + domain;
}

/**
 * Generate a random email address.
 *
 * @param {*} config The pentf configuration object. `config.email` needs to be set.
 * @param {string?} prefix Text to put before the random characters.
                           If no prefix is specified, the test name is used if available.
 * @returns {string} If `config.email` is `'foo@bar.com'`, something like `foo+prefix129ad12@bar.com`
 */
function makeRandomEmail(config, prefix) {
    if (prefix === undefined) {
        prefix = config._testName || '';
    }

    // Some providers can't deal with "[" and "]", which we'll add if tests are repeated
    // See: https://stackoverflow.com/a/2049510
    prefix = prefix.replace(/[[\]]/g, '_');

    return makeEmailAddress(config, prefix + Math.random().toString(36).slice(2));
}

/**
 * Returns a promise that resolves after the specified time. This should be used sparingly and mostly for debugging tests.
 *
 * @example
 * ```javascript
 * await wait(10000); // wait for 10s
 * ```
 * @param {number} ms Number of milliseconds to wait.
 */
async function wait(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

async function retry(func, waitTimes) {
    for (const w of waitTimes) {
        const res = await func();
        if (res) return res;
        await wait(w);
    }
    return await func();
}

function randomHex() {
    return [
        '0', '1', '2', '3', '4', '5', '6', '7',
        '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'][Math.floor(Math.random() * 16)];
}

/**
 * Generate a random hex string.
 *
 * @param {number} len Length of the hex string.
 * @return string A random hex string, e.g. `A812F0D91`
 */
function randomHexstring(len) {
    let res = '';
    while (len-- > 0) {
        res += randomHex();
    }
    return res;
}

function regexEscape(s) {
    // From https://stackoverflow.com/a/3561711/35070
    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * @param {string} s
 * @returns {boolean}
 */
function isValidRegex(s) {
    try {
        new RegExp(s);
        return true;
    } catch (err) {
        return false;
    }
}

function* range(count) {
    for (let i = 0;i < count;i++) {
        yield i;
    }
}

/**
 * Range as array
 * @param {number} count
 */
function arange(count) {
    return Array.from(range(count));
}

function count(ar, filter) {
    let res = 0;
    for (var el of ar) {
        if (filter(el)) res++;
    }
    return res;
}

/**
 * @template T
 * @param {T} obj
 * @param {Array<keyof T>} keys
 */
function pluck(obj, keys) {
    const res = {};
    for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(obj, k)) {
            res[k] = obj[k];
        }
    }
    return res;
}

// Remove the element for which callback returns true from the array.
function remove(array, callback) {
    for (let i = 0;i < array.length;i++) {
        if (callback(array[i])) {
            array.splice(i, 1);
            return;
        }
    }
    throw new Error('Did not remove anything');
}

function filterMap(ar, cb) {
    const res = [];
    for (let i = 0;i < ar.length;i++) {
        const mapped = cb(ar[i], i);
        if (mapped) {
            res.push(mapped);
        }
    }
    return res;
}

const _pad = num => ('' + num).padStart(2, '0');

function timezoneOffsetString(offset) {
    if (!offset) return 'Z';

    const sign = (offset < 0) ? '+' : '-';
    offset = Math.abs(offset);
    const minutes = offset % 60;
    const hours = (offset - minutes) / 60;
    return sign + _pad(hours) + ':' + _pad(minutes);
}

function localIso8601(date) {
    if (!date) date = new Date();

    // Adapted from: https://stackoverflow.com/a/8563517/35070
    return (
        date.getFullYear()
        + '-' + _pad(date.getMonth() + 1)
        + '-' + _pad(date.getDate())
        + 'T' + _pad(date.getHours())
        + ':' + _pad(date.getMinutes())
        + ':' + _pad(date.getSeconds())
        + '.' + String((date.getMilliseconds() / 1000).toFixed(3)).slice(2, 5)
        + timezoneOffsetString(date.getTimezoneOffset())
    );
}

function assertEventually(...args) {
    // Deprecated here; will warn in the future, and eventually be removed
    const assert_utils = require('./assert_utils');
    if (process.env.PENTF_FUTURE_DEPRECATIONS) {
        // eslint-disable-next-line no-console
        console.log(); // new line (we can't call output.log here)
        // eslint-disable-next-line no-console
        console.trace('utils.assertEventually has been moved to assert_utils');
    }
    return assert_utils.assertEventually(...args);
}

function assertAsyncEventually(...args) {
    // Deprecated here; will warn in the future, and eventually be removed
    const assert_utils = require('./assert_utils');
    if (process.env.PENTF_FUTURE_DEPRECATIONS) {
        // eslint-disable-next-line no-console
        console.log(); // new line (we can't call output.log here)
        // eslint-disable-next-line no-console
        console.trace('utils.assertAsyncEventually has been moved to assert_utils');
    }
    return assert_utils.assertAsyncEventually(...args);
}

function assertAlways(...args) {
    // Deprecated here; will warn in the future, and eventually be removed
    const assert_utils = require('./assert_utils');
    if (process.env.PENTF_FUTURE_DEPRECATIONS) {
        // eslint-disable-next-line no-console
        console.log(); // new line (we can't call output.log here)
        // eslint-disable-next-line no-console
        console.trace('utils.assertAlways has been moved to assert_utils');
    }
    return assert_utils.assertAlways(...args);
}

function cmp(a, b) {
    if (a < b) {
        return -1;
    } else if (a > b) {
        return 1;
    } else {
        return 0;
    }
}

function cmpKey(key) {
    return function(x, y) {
        return cmp(x[key], y[key]);
    };
}

/**
 * Delete n characters at a specific position in a string
 * @param {string} input
 * @param {number} idx
 * @param {number} count
 */
function removeAt(input, idx, count) {
    if (idx >= 0 && input.length <= 1) return '';
    if (idx < 0) return input;
    if (idx > input.length - 1) return input.substr(0, idx);
    return input.substr(0, idx) + input.substr(idx + count);
}

/**
 * Ignore these errors
 * @param {Error} err
 */
function ignoreError(err) {
    return /Execution context was destroyed|(Session|Connection|Target) closed/.test(err.message);
}

module.exports = {
    arange,
    assertAlways,
    assertAsyncEventually,
    assertEventually,
    cmp,
    cmpKey,
    count,
    filterMap,
    ignoreError,
    isValidRegex,
    localIso8601,
    makeRandomEmail,
    pluck,
    randomHex,
    randomHexstring,
    range,
    regexEscape,
    remove,
    removeAt,
    retry,
    timezoneOffsetString,
    wait,
};
