const output = require('./output');

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
 * @param {import('puppeteer').CoverageEntry[]} entries
 */
function logCoverage(config, entries) {
    entries.sort((a, b) => a.url.localeCompare(b.url));

    let maxUrlLength = 0;
    let totalBytes = 0;
    let totalUsedBytes = 0;

    let rows = '';
    for (const entry of entries) {
        const used = entry.ranges.reduce((acc, range) => acc + range.end - range.start - 1, 0);
        const percent = (used / entry.text.length) * 100;
        const rounded = Math.round((percent + Number.EPSILON) * 100) / 100;

        totalBytes += entry.text.length;
        totalUsedBytes += used;

        if (entry.url.length > maxUrlLength) {
            maxUrlLength = entry.url.length;
        }

        const url = entry.url + ' '.repeat(maxUrlLength - entry.url.length);
        const usedPercent = String(rounded).padStart(6, ' ');
        const color = getColor(rounded);

        rows += `| ${output.color(config, color, url)} | ${output.color(config, color, usedPercent + '%')} |                 |\n`;
    }

    const totalUsed =
        Math.round(((totalUsedBytes / totalBytes) * 100 + Number.EPSILON) * 100) / 100;

    const divider = `|-${'-'.repeat(maxUrlLength)}-|---------|-----------------|`;
    const msg = `${divider}
| Url${' '.repeat(maxUrlLength - 3)} | Covered | Uncovered Lines |
${divider}
${rows}${divider}
| ${' '.repeat(maxUrlLength)} |  ${output.color(config, getColor(totalUsed), totalUsed + '%')} |                 |
${divider}
`;
    console.log()
    output.log(config, msg);
}

module.exports = {
    logCoverage,
};
