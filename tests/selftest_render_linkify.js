const assert = require('assert');

const {_linkify: linkify} = require('../render');

async function run() {
    assert.strictEqual(linkify('https://ix.de/'), '<a href="https://ix.de/">https://ix.de/</a>');
    assert.strictEqual(linkify('no <link>'), 'no &lt;link&gt;');
    assert.strictEqual(
        linkify(
            'As reported on https://boxine.atlassian.net/browse/TOC-1234 , <URL> (for URL=http://localhost:3000/?foo=bar&baz=9 )'
        ),
        'As reported on <a href="https://boxine.atlassian.net/browse/TOC-1234">https://boxine.atlassian.net/browse/TOC-1234</a> ' +
            ', &lt;URL&gt; (for URL=<a href="http://localhost:3000/?foo=bar&amp;baz=9">http://localhost:3000/?foo=bar&amp;baz=9</a> )'
    );
}

module.exports = {
    description:
        'Testing the integration test framework itself: Create links for URLs embedded in text',
    run,
};
