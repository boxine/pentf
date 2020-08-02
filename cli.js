#!/usr/bin/env node
const pentf = require('./index.js');

const cwd = process.cwd();
pentf.main({
    description: 'pentf - Parallel End-To-End Test Framework',
    rootDir: cwd,
    testsDir: cwd,
});
