const assert = require('assert');
const {
    _generateClientName: generateClientName,
} = require('../src/external_locking');
const { pentfVersion } = require('../src/version');

async function run() {
    assert.equal(
        generateClientName({
            env: {
                CI_PROJECT_NAME:
                    'a-project-with-an-extremely-unreasonably-elaborate-long-name',
                CI_BRANCH_NAME:
                    'a-branch-with-an-extremely-unreasonably-elaborate-long-name',
                CI_COMMIT_SHA: 'de2b4c34ef86570c601d196a78270b71347752f7',
                CI_COMMIT_SHORT_SHA: 'de2b4c3',
                CI_ENVIRONMENT_NAME: 'dev\n',
                CI_JOB_URL:
                    'https://gitlab.example.org/group/project/-/jobs/1234567',
            },
            nowStr: '2020-07-25T12:44:51.305+02:00',
        }),
        'ci a-project-with-an-extremely-un de2b4c3 dev' +
            ` https://gitlab.example.org/group/project/-/jobs/1234567 ${pentfVersion()}` +
            ' 2020-07-25T12:44:51.305+02:00'
    );
}

module.exports = {
    run,
    description:
        'External locking uses a client ID to be able to determine which job is holding a lock.' +
        'Check the generation of this ID on a CI server.',
    resources: [],
};
