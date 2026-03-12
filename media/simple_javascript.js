// A Simple JavaScript configuration file just exports its configuration

function calc_main_url() {
    return 'https://example.org/';
}

module.exports = {
    extends: 'async_javascript',

    shop_prefix: 'https://shop.example.org/buy/',
    main_url: calc_main_url(),
    simple_loaded: true,

    overriden: 'simple_javascript',
};
