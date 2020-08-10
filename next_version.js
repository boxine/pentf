#!/usr/bin/env node

const currentVersion = require('./package.json').version;
const parts = currentVersion.split('.');
parts[parts.length - 1] = '' + (parseInt(parts[parts.length - 1]) + 1);
console.log(parts.join('.'));
