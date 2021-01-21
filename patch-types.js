const fs = require('fs');
const path = require('path');

function addModule(name, content) {
    const type = content
        .replace(/declare function/g, 'function')
        .split('\n').map(x => '    ' + x).join('\n');

    return `\ndeclare module "${name}" {\n${type}\n}\n`;
}

const entries = Object.keys(require('./package.json').exports)
    .filter(x => x !== './package.json' && x !== './');

let main = '';

for (const entry of entries) {
    const name = entry === '.' ? 'index' : entry.slice(2);
    const type = fs.readFileSync(path.join(__dirname, 'dist', 'types', name + '.d.ts'), 'utf-8');
    const mod = name === 'index' ? 'pentf' : 'pentf/' + name;
    main += addModule(mod, type);
}

const target = path.join(__dirname, 'dist', 'types', '__index.d.ts');
fs.writeFileSync(target, main);

