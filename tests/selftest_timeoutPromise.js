const assert = require('assert').strict;

const {timeoutPromise} = require('../src/promise_utils');
const {wait} = require('../src/utils');

async function run(config) {
    await timeoutPromise(config, wait(10), {timeout: 1000});

    await assert.rejects(
        timeoutPromise(config, wait(1000), {timeout: 10}),
        err => {
            assert(err.message.startsWith('Promise did not finish within 10ms'));
            return true;
        }
    );

    await assert.rejects(
        timeoutPromise(config, wait(1000), {timeout: 10, message: 'wait took too long'}),
        {message: 'Promise did not finish within 10ms. wait took too long'});

    await assert.rejects(
        timeoutPromise(config, (async() => {
            await wait(10);
            throw new Error('custom error');
        })(), {timeout: 500, message: 'wait took too long'}),
        {message: 'custom error'});

    // Test with warning: true (output instead of thrown error)
    const logs = [];
    const logCaptureConfig = {
        ...config,
        logFunc: (config, line) => logs.push(line),
    };
    await timeoutPromise(
        logCaptureConfig, wait(1000), {timeout: 1, warning: true, message: 'only a warning'});
    assert.strictEqual(logs.length, 1);
    assert(
        logs[0].startsWith('WARNING: Promise did not finish within 1ms. only a warning'),
        `Start of ${logs[0]} looks fishy`);

    // Test that we don't log a warning if the promise has resolved
    logs.splice(0, logs.length);
    await timeoutPromise(logCaptureConfig, wait(10), {timeout: 500, warning: true});

    await assert.rejects(
        timeoutPromise(
            logCaptureConfig, (async() => {
                await wait(10);
                throw new Error('custom error');
            })(),
            {timeout: 500, warning: true}
        ),
        {message: 'custom error'}
    );

    await wait(1000); // long enough for both timeouts to clearly fire
    assert.deepStrictEqual(logs, []);
}

module.exports = {
    description: 'Test promise_utils.timeoutPromise',
    resources: [],
    run,
};
