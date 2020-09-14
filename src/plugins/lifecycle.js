/**
 * Schedule a callback to be called before the first test is run.
 * @param {import("../config").Config} config
 * @param {import("../config").EventHandler} fn
 */
function onStartRun(config, fn) {
    config.events.onStartRun.push(fn);
}

/**
 * Schedule a callback to be called after all tests are completed.
 * @param {import("../config").Config} config
 * @param {import("../config").EventHandler} fn
 */
function onFinishRun(config, fn) {
    config.events.onFinishRun.push(fn);
}

/**
 * Schedule a callback to be called before pentf terminates
 * @param {import("../config").Config} config
 * @param {import("../config").EventHandler} fn
 */
function onShutdown(config, fn) {
    config.events.onStartRun.push(fn);
}

module.exports = {
    onStartRun,
    onFinishRun,
    onShutdown,
};
