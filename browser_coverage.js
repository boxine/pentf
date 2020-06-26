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

    let totalBytes = 0;
    let totalUsedBytes = 0;

    let rows = [
        ['Url', 'Covered', 'Uncovered Lines']
    ];
    for (const entry of entries) {
        const used = entry.ranges.reduce((acc, range) => acc + range.end - range.start - 1, 0);
        const percent = (used / entry.text.length) * 100;
        const rounded = Math.round((percent + Number.EPSILON) * 100) / 100;

        totalBytes += entry.text.length;
        totalUsedBytes += used;

        const color = getColor(rounded);
        rows.push([
            output.color(config, color, entry.url),
            output.color(config, color, rounded + '%'),
            ''
        ]);
    }
    
    
    const totalUsed =
        Math.round(((totalUsedBytes / totalBytes) * 100 + Number.EPSILON) * 100) / 100;
    const totalFormatted = output.color(config, getColor(totalUsed), totalUsed + '%');
    rows.push(['', totalFormatted, '']);

    console.log();
    console.log(output.formatTable(rows, { showHeaderDivider: true, showFooterDivider: true, showDivider: false}));
}

module.exports = {
    logCoverage,
};
