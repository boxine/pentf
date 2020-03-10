const {fetch} = require('./net_utils');
const mkdirpCb = require('mkdirp');
const {promisify} = require('util');
const path = require('path');
const fs = require('fs');
const unzip = require('extract-zip');

const mkdirp = promisify(mkdirpCb);

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36';

/**
 * Wait until a stream is completed
 * @param {NodeJS.ReadStream} stream 
 */
function waitForStream(stream) {
    return new Promise((resolve, reject) => {
        stream.on('error', err => reject(err));
        stream.on('finish', resolve);
    });
}


/**
 * Parse a chrome webstore url and extract the extension id + name.
 * Example input:
 *   https://chrome.google.com/webstore/detail/preact-developer-tools/ilcajpmogmhpliinlbcdebhbcanbghmd?hl=en-GB
 *   https://chrome.google.com/webstore/detail/react-developer-tools/fmkadmapgofadopljbjfkapdkoienihi
 * @param {string} store_url 
 */
function parseStoreUrl(store_url) {
    const url = new URL(store_url);

    if (url.origin !== 'https://chrome.google.com') {
        throw new Error('Not a valid chrome webstore url');
    }

    const match = url.pathname.match(/\/webstore\/detail\/([\w-]+)\/([a-z]+)/);
    if (!match || !match[1] || !match[2]) {
        throw new Error('Could not parse extension id in url: ' + store_url);
    }

    return {
        url,
        name: match[1],
        id: match[2],
    };
}

/**
 * Download CRX extension file from chrome webstore
 * @param {string} id
 * @param {string} target_file
 */
async function download_extension(id, target_file) {
    // The only URL that works. Most solutions on StackOverflow are outdated
    // and don't work anymore. This url works and is taken from:
    // https://github.com/acvetkov/download-crx/blob/c6330955938d7fe70d7851edd56c329804648fbb/src/index.js#L13
    // const url = `https://update.googleapis.com/service/update2/crx?response=redirect&acceptformat=crx3&prodversion=38.0&testsource=download-crx&x=id%3D${id}%26installsource%3Dondemand%26uc`;
    const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=49.0&acceptformat=crx3&x=id%3D${id}%26installsource%3Dondemand%26uc`;
    // var replacer = '***';;

    const response = await fetch({}, url, {
        redirect: 'follow',
        headers: {'User-Agent': USER_AGENT}
    });
    
    const fileStream = fs.createWriteStream(target_file);
    response.body.pipe(fileStream);
    await waitForStream(response.body);
}

/**
 * Extract a crx file which is essentially a zip file with some custom headers. Those are not important for
 * us, so we just need to find the zip file.
 * @param {Buffer} buf
 */
function extractZipFromCrx(buf) {
    if (buf.readUInt32BE(0) !== 0x43723234) { // Cr24
        throw new Error('Invalid crx header');
    }
    
    const version = buf.readUInt32LE(4);
    switch (version) {
    case 3: {
        const header_len = buf.readUInt32LE(8);

        // FIXME: Up until this point everything is correct.
        const res = buf.slice(12 + header_len);
        console.log(buf.length, res.length);
        return res;
    }
    default:
        throw new Error(`Unsupported CRX version: ${version}`);
    }
}

/**
 * Download extension if it is an url
 * @param {string} pathOrUrl 
 */
async function maybe_install_extension(pathOrUrl) {
    if (/^https:\/\//.test(pathOrUrl)) {
        const { id, name } = parseStoreUrl(pathOrUrl);
        const extension_dir = path.join(__dirname, '.local-extensions');
        const target_dir = path.join(extension_dir, name);
        const crx_file = path.join(extension_dir, name + '.crx');

        await mkdirp(path.dirname(target_dir));

        // Only iniate download if not present in local cache
        if (!fs.existsSync(crx_file)) {
            await download_extension(id, crx_file);

            console.log();
            console.log('Extracting crx file...');
            console.log();

            // Puppeteer can't install CRX files, but we can simply
            // unpack it. A CRX file is similar to a zip file.
            const buffer = extractZipFromCrx(fs.readFileSync(crx_file));
            const zip_file = path.join(extension_dir, name + '.zip');
            fs.writeFileSync(zip_file, buffer);

            await new Promise((resolve, reject) => {
                unzip(zip_file, {dir: target_dir}, err => err ? reject(err) : resolve());
            });
            throw new Error('fail');
        }

        return target_dir;
    }

    return pathOrUrl;
}

module.exports = {
    maybe_install_extension,
};
