#!/usr/bin/env node
const pentf = require('../src/index.js');

pentf.main({
    description: 'pentf - Parallel End-To-End Test Framework',
    rootDir: process.cwd(),
});
