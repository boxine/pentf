const sane = require('sane');


/**
 * 
 * @param {string} dir 
 * @param {string} glob 
 * @param {(filepath) => void} onChange 
 */
function createWatcher(dir, glob, onChange) {
    const watcher = sane(dir, {glob});
    watcher.on('change', onChange);
    watcher.on('add', onChange);
    return watcher;
}

module.exports = {
    createWatcher,
};
