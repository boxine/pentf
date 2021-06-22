import { newPage, waitForText } from '../../src/browser_utils';
import { TaskConfig } from '../../src/internal';

async function run(config: TaskConfig) {
    const page = await newPage(config);
    await page.setContent('<h1>ts-node</h1>');

    await waitForText(page, 'ts-node');
}

module.exports = {
    description: 'Pass a simple TypeScript test',
    run,
};
