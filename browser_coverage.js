const fs = require('fs').promises;
const path = require('path');
const mkdirp = require('mkdirp');
const rimraf = require('rimraf');
const {promisify} = require('util');
const escapeFilename = require('sanitize-filename');
const output = require('./output');
const {escape_html} = require('./render');

/**
 * @typedef {import('puppeteer').CoverageEntry & { type: 'js' | 'css'}} CoverageEntry
 */

/**
 *
 * @param {number} value
 */
function getColor(value) {
    if (value > 79) return 'green';
    else if (value > 49) return 'lightYellow';
    return 'red';
}

/**
 *
 * @param {*} config
 * @param {CoverageEntry[]} entries
 */
function logCoverage(config, entries) {
    if (entries.length === 0) {
        output.log(config, 'Code coverage capturing did not return anything.');
        return;
    }

    let totalBytes = 0;
    let totalUsedBytes = 0;

    let rows = [
        ['Url', 'Covered', 'Uncovered Lines'],
        ['', '', ''],
    ];
    for (const entry of entries) {
        const used = entry.ranges.reduce((acc, range) => acc + range.end - range.start - 1, 0);
        const percent = (used / entry.text.length) * 100;
        const rounded = Math.round((percent + Number.EPSILON) * 100) / 100;

        totalBytes += entry.text.length;
        totalUsedBytes += used;

        const url = !/\.(css|js)$/.test(entry.url)
            ? `${entry.url} (inline-${entry.type})`
            : entry.url;

        const color = getColor(rounded);
        rows.push([
            output.color(config, color, url),
            output.color(config, color, rounded + '%'),
            '',
        ]);
    }

    const totalUsed =
        Math.round(((totalUsedBytes / totalBytes) * 100 + Number.EPSILON) * 100) / 100;
    const totalFormatted = output.color(config, getColor(totalUsed), totalUsed + '%');
    rows.push(['', '-'.repeat(String(totalUsed).length + 1), '']);
    rows.push(['', totalFormatted, '']);

    output.log(
        config,
        output.formatTable(rows, {
            showHeaderDivider: true,
            showFooterDivider: true,
            showDivider: false,
        })
    );
}

/**
 * Generate an HTML coverage report
 * @param {CoverageEntry[]} entries
 * @param {string} dest Path to where the html files should be saved to
 */
async function reportCoverageHtml(entries, dest) {
    await promisify(rimraf)(dest);
    await mkdirp(dest);

    const rows = entries.map(entry => {
        const href = escapeFilename(entry.url + '.html');
        const name = escape_html(entry.url);
        return `
            <tr>
                <td><a href="${href}">${name}</a></td>
                <td></td>
            </tr>`;
    });

    const overview = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,minimal-ui">
    <title>Coverage data</title>
</head>
<body>
<table>
    <thead>
        <tr>
            <th>Url</th>
            <th>Covered</th>
        </tr>
    </thead>
    <tbody>
        ${rows.join('\n')}
    </tbody>
</table>
</body>
</html>`;

    await fs.writeFile(path.join(dest, 'index.html'), overview, 'utf-8');

    for (const entry of entries) {
        const lines = entry.text.split(/\n/g).map((line, i) => {
            return `<tr><td class="line-num" data-line="${i + 1}"></td><td>${escape_html(line)}</td></tr>`;
        });

        const page = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,minimal-ui">
    <title>Coverage data</title>
    <style>
        .code-table {
            font-family: Hack, monospace;
            white-space: pre;
            word-wrap: normal;
            overflow: visible;
            tab-size: 2;
        }

        .line-num::before {
            text-align: right;
            color: rgba(27, 31, 35, .3);
            content: attr(data-line);
        }
    </style>
</head>
<body>
    <header>
        <h1>${escape_html(entry.url)}</h1>
        <p>Covered: ${'TODO'}%</p>
    </header>
    <table class="code-table">
        <tbody>
            ${lines.join('\n')}
        </tbody>
    </table>
</body>
</html>`;

        const filename = escapeFilename(entry.url + '.html');
        await fs.writeFile(path.join(dest, filename), page, 'utf-8');
    }
}

module.exports = {
    logCoverage,
    reportCoverageHtml,
};
