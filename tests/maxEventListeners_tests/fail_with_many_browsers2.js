const { run } = require('./fail_with_many_browsers');

module.exports = {
    description: 'Fail with many open browsers',
    resources: ['many_browsers'],
    run,
};
