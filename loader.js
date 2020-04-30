const fs = require('fs');
const path = require('path');
const glob = require('glob');
const {promisify} = require('util');

async function loadTests(args, testsDir, globPattern = '*.js') {
    const testFiles = await promisify(glob.glob)(globPattern, {cwd: testsDir});
    let tests = testFiles.map(n => ({
        path: n,
        name: path.basename(n, path.extname(n)),
    }));

    if (args.filter) {
        tests = tests.filter(n => new RegExp(args.filter).test(n.name));
    }
    if (args.filter_body) {
        const bodyFilterRe = new RegExp(args.filter_body);
        tests = (await Promise.all(tests.map(async test => {
            const filePath = path.join(testsDir, test.path);
            const contents = await promisify(fs.readFile)(filePath, {encoding: 'utf-8'});
            return bodyFilterRe.test(contents) ? test : null;
        }))).filter(t => t);
    }

    
    return tests.map(t => {
        console.log(path.join(testsDir, t.path))
        const tc = require(path.join(testsDir, t.path));
        tc.name = t.name;
        return tc;
    });
}

module.exports = {
    loadTests,
};
