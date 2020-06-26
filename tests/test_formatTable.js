const assert = require('assert').strict;
const output = require('../output');

async function run(config) {
    assert.equal(
        output.formatTable([
            ['Used', 'Covered', 'Uncovered Lines'],
            ['https://preactjs.com/', '93.75%', ''],
            ['https://preactjs.com/bundle.1d040.esm.js', '34.87%', ''],
            ['https://preactjs.com/bundle.8cae9.css', '17.8%', ''],
        ]),
        `
┌──────────────────────────────────────────┬─────────┬─────────────────┐
| Used                                     │ Covered │ Uncovered Lines │
├──────────────────────────────────────────┼─────────┼─────────────────┤
| https://preactjs.com/                    │  93.75% │                 │
├──────────────────────────────────────────┼─────────┼─────────────────┤
| https://preactjs.com/bundle.1d040.esm.js │  34.87% │                 │
├──────────────────────────────────────────┼─────────┼─────────────────┤
| https://preactjs.com/bundle.8cae9.css    │   17.8% │                 │
└──────────────────────────────────────────┴─────────┴─────────────────┘
`.trim() + '\n'
    );

    assert.equal(
        output.formatTable(
            [
                ['Used', 'Covered', 'Uncovered Lines'],
                ['https://preactjs.com/', '93.75%', ''],
                ['https://preactjs.com/bundle.1d040.esm.js', '34.87%', ''],
                ['https://preactjs.com/bundle.8cae9.css', '17.8%', ''],
            ],
            { showDivider: false, showHeaderDivider: true }
        ),
        `
┌──────────────────────────────────────────┬─────────┬─────────────────┐
| Used                                     │ Covered │ Uncovered Lines │
├──────────────────────────────────────────┼─────────┼─────────────────┤
| https://preactjs.com/                    │  93.75% │                 │
| https://preactjs.com/bundle.1d040.esm.js │  34.87% │                 │
| https://preactjs.com/bundle.8cae9.css    │   17.8% │                 │
└──────────────────────────────────────────┴─────────┴─────────────────┘
`.trim() + '\n'
    );

    assert.equal(
        output.formatTable(
            [
                ['Used', 'Covered', 'Uncovered Lines'],
                ['https://preactjs.com/', '93.75%', ''],
                ['https://preactjs.com/bundle.1d040.esm.js', '34.87%', ''],
                ['https://preactjs.com/bundle.8cae9.css', '17.8%', ''],
                ['', '100%', ''],
            ],
            { showDivider: false, showHeaderDivider: true, showFooterDivider: true }
        ),
        `
┌──────────────────────────────────────────┬─────────┬─────────────────┐
| Used                                     │ Covered │ Uncovered Lines │
├──────────────────────────────────────────┼─────────┼─────────────────┤
| https://preactjs.com/                    │  93.75% │                 │
| https://preactjs.com/bundle.1d040.esm.js │  34.87% │                 │
| https://preactjs.com/bundle.8cae9.css    │   17.8% │                 │
├──────────────────────────────────────────┼─────────┼─────────────────┤
|                                          │    100% │                 │
└──────────────────────────────────────────┴─────────┴─────────────────┘
`.trim() + '\n'
    );

    assert.equal(
        output.formatTable(
            [
                ['Used', 'Covered', 'Uncovered Lines'],
                [output.color(config, 'red', 'red color'), output.color(config, 'red', '1.77%'), ''],
                ['https://preactjs.com/', '93.75%', ''],
                ['', output.color(config, 'green', '100%'), ''],
            ],
            { showDivider: false, showHeaderDivider: true, showFooterDivider: true }
        ),
        `
┌───────────────────────┬─────────┬─────────────────┐
| Used                  │ Covered │ Uncovered Lines │
├───────────────────────┼─────────┼─────────────────┤
| ${output.color(config, 'red', 'red color')}             │   ${output.color(config, 'red', '1.77%')} │                 │
| https://preactjs.com/ │  93.75% │                 │
├───────────────────────┼─────────┼─────────────────┤
|                       │    ${output.color(config, 'green', '100%')} │                 │
└───────────────────────┴─────────┴─────────────────┘
`.trim() + '\n'
    );
}

module.exports = {
    description: 'Format a table for logging to cli',
    run,
    resources: [],
};
