const runner = require('../src/runner');

async function run(config) {
    const tasks = [
        {
            name: 'A',
            run() {},
        },
        {
            name: 'B',
            run() {},
        },
    ];
    await runner.run(
        {
            ...config,
            quiet: true,
            logFunc: () => null,
            external_locking_client: 'test_locking_server',
            // We should not do any request to the lockserver at all,
            // so we simply pick an invalid URL and let the agent throw.
            external_locking_url: 'https://localhost:1',
        },
        tasks
    );
}

module.exports = {
    run,
    description: "Don't create temporary resources for tasks without resources",
};
