const {register} = require('esbuild-register/dist/node');
register({
    sourcemap: true,
    minify: false,
    keepNames: false,
});

const {main} = require('./main');

module.exports = {
    main,
};
