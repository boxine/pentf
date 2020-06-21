const {closePage, newPage} = require('../browser_utils');

async function run(config) {
    const page = await newPage({...config, forward_console: true});
    await page.evaluate(() => {
        function foo() {
            console.log([
                [123, new Error('foo')],
                {
                    foo: {
                        bar: {
                            bob: {
                                boof: {
                                    baz: {
                                        sha: {
                                            fasd: {
                                                asd: 123,
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                null,
                undefined,
                'foo',
                new Error('fail'),
            ]);

            console.log([{'foo': null}]);

            // Circular
            const a = {foo: null};
            a.foo = a;
            console.log(a);

            console.log(new Set([1, 2, {foo: 123}]));
            console.log(
                new Map([
                    [{foo: 123}, [1, 2]],
                    [{foo: 123}, [1, 2]],
                ])
            );

            console.log(() => null);
            console.log(function foo() {});
            console.log(class Foo {});

            console.log('foo');
            console.log([1,2]);

            console.trace();
            console.trace('bar');
        }
        foo();
    });

    await closePage(page);
}

module.exports = {
    description: 'Test console forwarding',
    resources: [],
    skip: () => true,
    run,
};
