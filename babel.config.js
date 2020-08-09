module.exports = {
    plugins: [[require('./babel-transform-commonjs-to-esm'), {extension: '.mjs'}]],
};
