# Contribution guidelines

## Don't use inline `require()` calls

We use [babel](https://github.com/babel/babel) to generate a native ES Module build of pentf. The ES Module spec doesn't support synchronous inline loading of modules. Instead it provides an `import()` function, which returns a `Promise` object with the module content. Due to the incompatibility we cannot use inline `require` calls in our codebase.
