const fs = require('fs');

/**
 * @param {*} config 
 * @param {string} suffix 
 */
function makeEmailAddress(config, suffix) {
    const [account, domain] = config.email.split('@');
    return account + '+' + suffix + '@' + domain;
}

/**
 * @param {*} config 
 * @param {string} prefix 
 */
function makeRandomEmail(config, prefix) {
    if (!prefix) prefix = '';
    return makeEmailAddress(config, prefix + Math.random().toString(36).slice(2));
}

/**
 * @param {string} fileName 
 * @param {*} type 
 */
async function readFile(fileName, type) {
    return new Promise((resolve, reject) => {
        fs.readFile(fileName, type, (err, data) => {
            err ? reject(err) : resolve(data);
        });
    });
}

/**
 * @param {number} ms 
 */
async function wait(ms) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * @param {() => any} func 
 * @param {number[]} waitTimes 
 */
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
 * @param {number} len 
 */
function randomHexstring(len) {
    let res = '';
    while (len-- > 0) {
        res += randomHex();
    }
    return res;
}

/**
 * @param {string} s 
 */
function regexEscape(s) {
    // From https://stackoverflow.com/a/3561711/35070
    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * @param {number} count 
 */
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

/**
 * @template T
 * @param {T[]} ar 
 * @param {(item: T) => boolean} filter 
 */
function count(ar, filter) {
    let res = 0;
    for (var el of ar) {
        if (filter(el)) res++;
    }
    return res;
}

/**
 * @param {*} obj 
 * @param {string[]} keys 
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

/**
 * Remove the element for which callback returns true from the array.
 * @template T
 * @param {T[]} array
 * @param {(item: T) => boolean} callback
 */
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

/**
 * @param {number} num 
 */
const _pad = num => ('' + num).padStart(2, '0');

/**
 * @param {number} [offset] 
 */
function timezoneOffsetString(offset) {
    if (!offset) return 'Z';

    const sign = (offset < 0) ? '+' : '-';
    offset = Math.abs(offset);
    const minutes = offset % 60;
    const hours = (offset - minutes) / 60;
    return sign + _pad(hours) + ':' + _pad(minutes);
}

/**
 * @param {Date} [date] 
 */
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

/**
 * @param {() => any} testfunc 
 * @param {string | {message?: string, timeout?: number, checkEvery?: number, crashOnError?: boolean}} [options] 
 * @param {*} [_options] 
 */
async function assertEventually(testfunc, options, _options) {
    if (typeof options === 'string') {
        console.trace(`DEPRECATED call to assertEventually with non-option argument ${JSON.stringify(options)}`);
        if (!_options) {
            _options = {};
        }
        _options.message = options;
        options = _options;
    } else {
        // Normal call
        if (!options) {
            options = {};
        }
        options.message = options.message || 'assertEventually failed';
    }
    // @ts-ignore
    options.timeout = options.timeout || 10000;
    // @ts-ignore
    options.checkEvery = options.checkEvery || 200;
    // @ts-ignore
    options.crashOnError = (options.crashOnError === undefined) ? true : options.crashOnError;
    // @ts-ignore
    const {timeout, checkEvery, crashOnError, message} = options;

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
 * @param {() => Promise<any>} testfunc 
 * @param {{message?: string, timeout?: number, checkEvery?: number, crashOnError?: boolean}} [options] 
 * @param {*} [_options] 
 */
async function assertAsyncEventually(testfunc, options, _options) {
    if (typeof options === 'string') {
        console.trace(`DEPRECATED call to assertAsyncEventually with non-option argument ${JSON.stringify(options)}`);
        if (!_options) {
            _options = {};
        }
        _options.message = options;
        options = _options;
    } else {
        // Normal call
        if (!options) {
            options = {};
        }
        options.message = options.message || 'assertAsyncEventually failed';
    }
    // @ts-ignore
    options.timeout = options.timeout || 10000;
    // @ts-ignore
    options.checkEvery = options.checkEvery || 200;
    // @ts-ignore
    options.crashOnError = (options.crashOnError === undefined) ? true : options.crashOnError;
    // @ts-ignore
    const {timeout, checkEvery, crashOnError, message} = options;

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
 * @param {() => any} testfunc 
 * @param {{message?: string, timeout?: number, checkEvery?: number}} [options] 
 * @param {*} [_options] 
 */
async function assertAlways(testfunc, options, _options) {
    if (typeof options === 'string') {
        console.trace(`DEPRECATED call to assertAlways with non-option argument ${JSON.stringify(options)}`);
        if (!_options) {
            _options = {};
        }
        _options.message = options;
        options = _options;
    } else {
        // Normal call
        if (!options) {
            options = {};
        }
    }
    // @ts-ignore
    options.message = options.message || 'assertAlways failed';
    // @ts-ignore
    options.timeout = options.timeout || 10000;
    // @ts-ignore
    options.checkEvery = options.checkEvery || 200;
    // @ts-ignore
    const {timeout, checkEvery, message} = options;

    for (let remaining = timeout;remaining > 0;remaining -= checkEvery) {
        const res = testfunc();
        if (!res) {
            throw new Error(`${message} (after ${timeout - remaining}ms)`);
        }

        await wait(checkEvery);
    }
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

/**
 * @template K extends string
 * @param {K} key 
 */
function cmpKey(key) {
    return function(x, y) {
        return cmp(x[key], y[key]);
    };
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
    localIso8601,
    makeRandomEmail,
    pluck,
    randomHex,
    randomHexstring,
    range,
    readFile,
    regexEscape,
    remove,
    retry,
    timezoneOffsetString,
    wait,
};
