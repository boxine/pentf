#!/usr/bin/env node

const assert = require('assert');
const child_process = require('child_process');
const fs = require('fs');
const path = require('path');

function dedent(str) {
    const m = /^([ \t]+)/.exec(str);
    if (!m) return str;
    return str.replace(new RegExp('^' + m[1], 'mg'), '');
}

function main() {
    const readme_fn = path.join(__dirname, 'README.md');
    const readme_input = fs.readFileSync(readme_fn, {encoding: 'utf-8'});

    const readme_m = /^([^]+## Options)\n[^]*?\n(##[^#][^]*|\s*)$/.exec(readme_input);
    assert(readme_m);

    const full_help = (child_process.execSync('./run --help', {
        env: {
            COLUMNS: 110,
            PENTF_GENERIC_HELP: 'true',
        },
    }).toString('utf-8')
        .replace(/(-e\s+|\s--env\s+)\{[^}]*?\}/g, (_, key) => {
            return key + 'YOUR_ENVIRONMENTS';
        })
    );
    const main_help = /^[^]*\nOptional arguments:\n([^]+)$/.exec(full_help)[1];
    const help_groups = main_help.split('\n\n');
    const help_md = help_groups.map(hg => {
        const m = /^(\S.*):\n([^]*)$/.exec(hg);
        let header = '';
        if (m) {
            header += '###### ' + m[1];
            hg = m[2];
        }
        return header + '\n\n```\n' + dedent(hg).trim() + '\n```\n\n';
    }).join('');

    const new_readme = readme_m[1] + help_md + '\n' + readme_m[2];
    fs.writeFileSync(readme_fn, new_readme, {encoding: 'utf-8'});
}

main();
