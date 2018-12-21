const fs = require('fs');

function make_email_address(config, suffix) {
    const [account, domain] = config.email.split('@');
    return account + '+' + suffix + '@' + domain;
}

function make_random_email(config, prefix) {
    if (!prefix) prefix = '';
    return make_email_address(config, prefix + Math.random().toString(36).slice(2));
}

async function readFile(fileName, type) {
    return new Promise((resolve, reject) => {
        fs.readFile(fileName, type, (err, data) => {
            err ? reject(err) : resolve(data);
        });
    });
}

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

function random_hex() {
    return [
        '0', '1', '2', '3', '4', '5', '6', '7',
        '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'][Math.floor(Math.random() * 16)];
}

function random_hexstring(len) {
    let res = '';
    while (len-- > 0) {
        res += random_hex();
    }
    return res;
}

function re_escape(s) {
    // From https://stackoverflow.com/a/3561711/35070
    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function* range(count) {
    for (let i = 0;i < count;i++) {
        yield i;
    }
}

function count(ar, filter) {
    let res = 0;
    for (var el of ar) {
        if (filter(el)) res++;
    }
    return res;
}

function pluck(obj, keys) {
    const res = {};
    for (const k of keys) {
        if (obj.hasOwnProperty(k)) {
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

function filter_map(ar, cb) {
    const res = [];
    for (let i = 0;i < ar.length;i++) {
        const mapped = cb(ar[i], i);
        if (mapped) {
            res.push(mapped);
        }
    }
    return res;
}

module.exports = {
    count,
    filter_map,
    make_email_address,
    make_random_email,
    pluck,
    random_hex,
    random_hexstring,
    range,
    re_escape,
    readFile,
    remove,
    retry,
    wait,
};
