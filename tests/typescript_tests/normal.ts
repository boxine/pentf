import { newPage, waitForText } from "../../src/browser_utils";
import { TaskConfig } from "../../src/runner";

export async function run(config: TaskConfig) {
    const page = await newPage(config);
    await page.setContent('<h1>hello world!</h1>')

    const foo = { foo: 123}
    // console.log(foo.bar);

    throw new Error("fail")
    await waitForText(page, 'hello world');
}

