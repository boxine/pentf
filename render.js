const fs = require('fs');
const {promisify} = require('util');
const {newPage, closePage} = require('./browser_utils');
const {timezoneOffsetString} = require('./utils');

const utils = require('./utils');

function craftResults(config, test_info) {
    const {test_start, test_end, state} = test_info;

    const test_results = state.map(s => {
        const res = utils.pluck(s, ['status', 'name', 'duration']);

        if (s.error) {
            res.error_stack = s.error.stack;
        }

        if (s.tc.description) {
            res.description = s.tc.description;
        }

        return res;
    });
    return {
        start: test_start,
        duration: test_end - test_start,
        concurrency: config.concurrency,
        env: config.env,
        tests: test_results,
    };
}

async function doRender(config, results) {
    if (config.json) {
        const json = JSON.stringify(results, undefined, 2) + '\n';
        await promisify(fs.writeFile)(config.json_file, json, {encoding: 'utf-8'});
    }

    if (config.markdown) {
        const md = markdown(results);
        await promisify(fs.writeFile)(config.markdown_file, md, {encoding: 'utf-8'});
    }

    if (config.html) {
        const html_code = html(results);
        await promisify(fs.writeFile)(config.html_file, html_code, {encoding: 'utf-8'});
    }

    if (config.pdf) {
        await pdf(config, config.pdf_file, results);
    }
}

function format_duration(ms) {
    if (ms === undefined) {
        return '';
    }

    const rounded = (Math.round(10 * ms / 1000) / 10);
    if (rounded < 0.1) {
        return '<0.1s';
    }
    let rounded_str = '' + rounded;
    if (! rounded_str.includes('.')) {
        rounded_str += '\xa0\xa0\xa0';
    }

    return rounded_str + 's';
}

function format_timestamp(ts) {
    const _pad = num => ('' + num).padStart(2, '0');
    const date = new Date(ts);

    return (
        date.getFullYear()
        + '-' + _pad(date.getMonth() + 1)
        + '-' + _pad(date.getDate())
        + ' ' + _pad(date.getHours())
        + ':' + _pad(date.getMinutes())
        + ':' + _pad(date.getSeconds())
        + timezoneOffsetString(date.getTimezoneOffset())
    );
}

function escape_html(str) {
    // From https://stackoverflow.com/a/6234804/35070
    return (str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;'));
}

function markdown(results) {
    const table = results.tests.map((test_result, idx) => {
        return (
            '|' +
            (idx + 1) + ' | ' +
            test_result.name + ' | ' +
            (test_result.description || '') + ' | ' +
            format_duration(test_result.duration) + ' | ' +
            test_result.status + ' |'
        );
    }).join('\n');

    const success_count = utils.count(results.tests, s => s.status === 'success');
    const error_count = utils.count(results.tests, s => s.status === 'error');
    const skipped_count = utils.count(results.tests, s => s.status === 'skipped');

    return `# Integration Test Report

This is an automatically generated report of all performed integration tests for the Toniecloud.
For further information please contact <philipp.hagemeister@boxine.de>.

### Options
Tested Environment: **${results.env}**  
Concurrency: ${results.concurrency === 0 ? 'sequential' : results.concurrency}  
Start: ${format_timestamp(results.start)}  

### Results
Total number of tests: ${results.tests.length} (${success_count} successful, ${error_count} failures, ${skipped_count} skipped)  
Total test duration: ${format_duration(results.duration)}  

| #     | Test              | Description       | Duration | Result  |
|---    |-----------------  |-----------------  | -------- | ------  |
${table}

`;
}

function html(results) {
    const table = results.tests.map((test_result, idx) => {
        const errored = test_result.status === 'error';
        const skipped = test_result.status === 'skipped';
        const status_str = {
            'success': '✔️',
            'error': '✘',
        }[test_result.status] || test_result.status;

        const rowspan = 1 + (test_result.description ? 1 : 0) + (errored ? 1 : 0);

        let res = (
            `<tr class="${idx % 2 != 0 ? 'odd' : ''}">` +
            `<td class="test_number" rowspan="${rowspan}">` + + (idx + 1) + '</td>' +
            '<td>' + escape_html(test_result.name) + '</td>' +
            (skipped ? '' : '<td class="duration">' + escape_html(format_duration(test_result.duration)) + '</td>') +
            `<td class="result result-${test_result.status}" ${skipped ? 'colspan="2"' : ''}>` + status_str + '</td>' +
            '</tr>'
        );

        if (test_result.description) {
            res += (
                `<tr class="${idx % 2 != 0 ? 'odd' : ''}">` +
                '<td class="description" colspan="3">' +
                escape_html(test_result.description) +
                '</td>' +
                '</tr>'
            );
        }

        if (errored) {
            res += (
                `<tr class="${idx % 2 != 0 ? 'odd' : ''}">` +
                '<td colspan="3" class="error_stack">' +
                escape_html(test_result.error_stack) +
                '</td>' +
                '</tr>'
            );
        }

        return res;
    }).join('\n');

    const success_count = utils.count(results.tests, s => s.status === 'success');
    const error_count = utils.count(results.tests, s => s.status === 'error');
    const skipped_count = utils.count(results.tests, s => s.status === 'skipped');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<title>Integration Test Report</title>
<style>
html, body {
    margin-top: 0;
    font-size: 26px;
    font-family: sans-serif;
}
h1 {
    margin: 0 0 .1em 0;
    text-align: center;
}
h2 {
    margin: 0;
}
p {
    margin: .2em 0 .8em 0;
}
table {
    margin-top: 0.5em;
    border-collapse: collapse;
}
thead th {
    text-align: left;
}
tr.odd td, tr.odd th {
    background: #eee;
}
td.test_number {
    vertical-align: top;
    text-align: right;
    padding-right: .4em;
}
.description {
    font-size: 80%;
    color: #333;
}
.duration {
    text-align: right;
}
.error_stack {
    white-space: pre-wrap;
    font-family: monospace;
    font-size: 70%;
    color: #aa0000;
}
.result {
    text-align: center;
}
.result-skipped {
    text-align: right;
    padding-right: 1ex;
    color: #555;
}
.result-success {
    color: #250;
}
.result-error {
    color: #ff0000;
}

@media print {
    html, body {
        font-size: 16px;
    }
}
@page {
    size: A4;
    margin: 0.5cm 0.5cm;
}
</style>
</head>
<body>
<h1>Integration Test Report</h1>

<p>This is an automatically generated report of all performed integration tests for the Toniecloud.
For further information please contact <a href="philipp.hagemeister@boxine.de?subject=Integration-Test">philipp.hagemeister@boxine.de</a>.</p>

<h2>Options</h2>
<p>Tested Environment: <strong>${results.env}</strong><br/>
Concurrency: ${results.concurrency === 0 ? 'sequential' : results.concurrency}<br/>
Start: ${format_timestamp(results.start)}<br/>
</p>

<h2>Results</h2>
Total number of tests: ${results.tests.length} (${success_count} successful, ${error_count} failures, ${skipped_count} skipped)<br/>
Total test duration: ${escape_html(format_duration(results.duration))}<br/>

<table>
<tbody>
${table}
</tbody>
</table>
</body>
</html>

`;

}

async function pdf(config, path, results) {
    const html_code = html(results);
    const pdf_config = {...config};
    pdf_config.headless = true;
    const page = await newPage(pdf_config);

    await page.setContent(html_code);
    await page.pdf({
        path,
        printBackground: true,
        preferCSSPageSize: true,
    });
    await closePage(page);
}

module.exports = {
    craftResults,
    doRender,
};
