const { closePage, newPage } = require('../src/browser_utils');

async function run(config) {
    const page = await newPage(config);
    await page.setContent(`
        <script>
        setTimeout(() => {
            const input = document.createElement('input');
            input.setAttribute('id', 'input');
            document.body.appendChild(input);
        }, 1000);
        </script>`);
    // THIS WILL FAIL – Do not use! See selftest_typeSelector for a working equivalent
    await page.type('#input', 'foobar'); // WRONG CODE

    await closePage(page);
}

module.exports = {
    description:
        'Demonstration of an anti-pattern when typing into text fields',
    resources: [],
    run,
    skip: () =>
        !process.env.PENTF_DEMO && 'PENTF_DEMO environment variable not set',
    expectedToFail: 'Will crash',
};
