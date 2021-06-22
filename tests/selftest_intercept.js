const assert = require('assert').strict;
const http = require('http');

const {
    closePage,
    interceptRequest,
    newPage,
    waitForTestId,
} = require('../src/browser_utils');

async function get_result(page) {
    return await page.evaluate(
        () => document.querySelector('[data-testid="result"]').textContent
    );
}

function gen_content(fetchUrl) {
    return `
    <script>
        async function run() {
            const res = await fetch('${fetchUrl}')
            const text = await res.text();

            const div = document.createElement('div');
            div.setAttribute('data-testid', 'result');
            div.textContent = text;
            document.body.appendChild(div);
        }

        run();
    </script>`;
}

async function run(config) {
    const server = http.createServer((req, res) => res.end('404 - Not found'));
    const port = await new Promise((resolve, reject) => {
        server.listen(0, err => {
            if (err) return reject(err);

            const { port } = server.address();
            return resolve(port);
        });
    });
    const url = `http://localhost:${port}/`;

    const page = await newPage(config);

    // Add multiple listeners
    await interceptRequest(page, request => {
        if (request.url().endsWith('foo')) {
            request.respond({
                status: 200,
                contentType: 'text/plain',
                body: 'foobar',
            });
        }
    });
    await interceptRequest(page, request => {
        if (request.url().endsWith('bar')) {
            request.respond({
                status: 200,
                contentType: 'text/plain',
                body: 'barbaz',
            });
        }
    });
    await page.goto(url);

    await page.setContent(gen_content(url + '/foo'));
    await waitForTestId(page, 'result');
    const value = await get_result(page);
    assert.equal(value, 'foobar');

    await page.setContent(gen_content(url + '/bar'));
    await waitForTestId(page, 'result');
    const value2 = await get_result(page);
    assert.equal(value2, 'barbaz');

    await closePage(page);
}

module.exports = {
    description: 'interceptRequest to abort/continue requests',
    resources: [],
    run,
};
