const assert = require('assert').strict;
const kolorist = require('kolorist');
const output = require('./output');

function createSentry() {
    return {
        name: 'sentry',
        async onRunStart(config) {
            if (config.sentry) {
                const sentry_dsn = config.sentry_dsn;
                assert(
                    sentry_dsn,
                    'Sentry enabled with --sentry, but no DSN configured. Use --sentry-dsn,' +
                    ' set the configuration sentry_dsn, or the environment variable SENTRY_DSN.'
                );
                const Sentry = require('@sentry/node');
                Sentry.init({
                    dsn: sentry_dsn,
                    environment: config.env,
                    beforeBreadcrumb(breadcrumb) {
                        // Strip ansi color codes from sentry messages.
                        if (breadcrumb.message && typeof breadcrumb.message === 'string') {
                            breadcrumb.message = kolorist.stripColors(breadcrumb.message);
                        }
                        return breadcrumb;
                    },
                    integrations: [],
                });
            }
        },
        async onTaskDone(config, task) {
            const e = task.error;
            const show_error = output.shouldShowError(config, task);
            output.logVerbose(
                config,
                '[task] Decided whether to show error for task ' +
                `${task._runner_task_id} (${task.name}): ${JSON.stringify(show_error)}`
            );

            if (config.sentry && show_error && !e.pentf_expectedToSucceed) {
                output.logVerbose(
                    config,
                    '[task] Reporting error to sentry for ' +
                    `${task._runner_task_id} (${task.name})`
                );

                try {
                    const Sentry = require('@sentry/node');
                    Sentry.withScope(scope => {
                        scope.setTag('task', task.name);
                        scope.setTag('testcase', task.tc.name);
                        if (process.env.CI_JOB_URL) {
                            scope.setTag('jobUrl', process.env.CI_JOB_URL);
                        }
                        Sentry.captureException(e);
                    });
                } catch (sentryErr) {
                    output.log(
                        config,
                        `INTERNAL ERROR: Sentry reporting failed for ${task.name}: ${sentryErr}`);
                }
            }
        }
    };
}

module.exports = {
    createSentry,
};
