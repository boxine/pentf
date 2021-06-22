// A complex JavaScript configuration file can run arbitrary async code
module.exports = async env => {
    // We could download something here, or read a file, or ...
    await new Promise(resolve => resolve());

    return {
        async_loaded: true,
        overriden: 'async_javascript',
        server: `https://${env}.example.org/`,
    };
};
