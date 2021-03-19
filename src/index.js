const { register } = require('esbuild-register/dist/node');
register({
    sourcemap:true
});

const {main} = require('./main');

module.exports = {
    main,
};
