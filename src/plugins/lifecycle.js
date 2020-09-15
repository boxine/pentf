
/**
 * @param {import("../config").Config} config
 * @param {string[]} files
 */
async function onStart(config, files) {
    for (const plugin of config.plugins) {
        if (plugin.onStart) {
            await plugin.onStart(config, files);
        }
    }
}


/**
 * @param {import("../config").Config} config
 * @param {string[]} files
 */
async function onLoad(config, files) {
    const testCases = [];
    for (const plugin of config.plugins) {
        if (plugin.onLoad) {
            const res = await plugin.onLoad(config, files);
            if (Array.isArray(res)) {
                testCases.push(...res);
            } else if (res) {
                testCases.push(res);
            }
        }
    }

    return testCases;
}

/**
 * @param {import("../config").Config} config
 */
async function onRunStart(config) {
    for (const plugin of config.plugins) {
        if (plugin.onRunStart) {
            await plugin.onRunStart(config);
        }
    }
}

/**
 * @param {import("../config").Config} config
 */
async function onRunFinish(config) {
    for (const plugin of config.plugins) {
        if (plugin.onRunFinish) {
            await plugin.onRunFinish(config);
        }
    }
}

/**
 * @param {import("../config").Config} config
 */
async function onShutdown(config) {
    for (const plugin of config.plugins) {
        if (plugin.onShutdown) {
            await plugin.onShutdown(config);
        }
    }
}

module.exports = {
    onStart,
    onLoad,
    onRunStart,
    onRunFinish,
    onShutdown,
};
