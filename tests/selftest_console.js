const assert = require('assert').strict;
const path = require('path');
const child_process = require('child_process');

async function run() {
    const sub_run = path.join(__dirname, 'console', 'run');

    const {stdout} = await new Promise((resolve, reject) => {
        child_process.execFile(
            sub_run,
            ['--exit-zero', '--no-screenshots', '--forward-console'],
            (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve({stdout, stderr});
            }
        );
    });

    assert.equal(`[
  [
    123,
    Error: foo
        at foo (__puppeteer_evaluation_script__:4:23)
        at __puppeteer_evaluation_script__:61:9
  ],
  { foo: { bar: [Object] } },
  null,
  undefined,
  'foo',
  Error: fail
      at foo (__puppeteer_evaluation_script__:25:17)
      at __puppeteer_evaluation_script__:61:9
]
[ { foo: null } ]
{ foo: '[[Circular]]' }
Set(3) { 1, 2, { foo: 123 } }
Map(2) { { foo: 123 } => [ 1, 2 ], { foo: 123 } => [ 1, 2 ] }
[Function (anonymous)]
[Function: foo]
[Function: Foo]
foo
[ 1, 2 ]
Trace: console.trace
Trace: bar
Map(1) { 'map' => '[[Circular]]' }
Set(1) { '[[Circular]]' }
Log from Example
`,
    stdout
    );
}

module.exports = {
    description: 'Test console forwarding',
    resources: [],
    run,
};
