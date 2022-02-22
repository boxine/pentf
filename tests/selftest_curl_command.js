const assert = require('assert').strict;

const { promisify } = require('util');
const tough = require('tough-cookie');
const { makeCurlCommand } = require('../src/curl_command');

async function run() {
    const cookieJar = new tough.CookieJar();
    const setCookieFunc = promisify((cookie, url, callback) =>
        cookieJar.setCookie(cookie, url, {}, callback)
    );
    await setCookieFunc('foo=bar', 'https://example.com/');
    await setCookieFunc('bar="baz \'\\123"', 'https://example.com/');

    const params = new URLSearchParams();
    params.append('foo', 'bar');
    params.append('chars', 'ä€"\\\'');
    params.append('foo', 'baz');

    const curlCommand = await makeCurlCommand(
        {
            cookieJar,
            headers: {
                Referer: 'https://example.com/from?x=1',
                'X-Strange-Chars': '"\'\\',
            },
            body: params,
        },
        'https://example.com/target?x=2'
    );
    assert.equal(
        curlCommand,
        `curl -H 'Referer: https://example.com/from?x=1' -H 'X-Strange-Chars: "'"'"'\\'` +
            ` -H Expect: -H "Content-Type: application/x-www-form-urlencoded"` +
            ` -d foo=bar&chars=%C3%A4%E2%82%AC%22%5C%27&foo=baz 'https://example.com/target?x=2'`
    );
}

module.exports = {
    description:
        '-c / --print-curl option net_utils.fetch, namely cookie handling',
    run,
};
