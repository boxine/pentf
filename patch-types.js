const fs = require('fs');
const path = require('path');

// TypeScript doesn't understand package exports, so we need
// to pretend that every entry is a top-level one. See:
// https://github.com/microsoft/TypeScript/issues/33079
const typesDir = path.join(__dirname, 'dist', 'types');
const files = fs.readdirSync(typesDir)
    .map(file => path.join(typesDir, file));

for (const file of files) {
    fs.copyFileSync(file, path.join(__dirname, path.basename(file)));
}
