const { spawn } = require('child_process');
const assert = require('assert');
const path = require('path');
const fs = require('fs').promises;
const { ignoreError } = require('./utils');

/**
 * Get time without daylight savings or other human concepts.
 * See https://stackoverflow.com/questions/46964779/monotonically-increasing-time-in-node-js
 * @returns {number}
 */
function monotonicTime() {
    const [seconds, nanoseconds] = process.hrtime();
    return seconds * 1000 + Math.trunc(nanoseconds / 1000000);
}

class VideoRecorder {
    /**
     * @param {string} ffmpegPath
     * @param {import('puppeteer').Page} page
     */
    constructor(ffmpegPath, page) {
        this.ffmpegPath = ffmpegPath;
        this._process = null;
        this._page = page;
        /** @type {{ buffer: Buffer, timestamp: number } | null} */
        this._lastFrame = null;
        // Seems to be the maximum value the browser can keep up with.
        // TODO: should we expose this?
        this._fps = 25;
        /** @type {Buffer[]} */
        this._frameQueue = [];

        // Chrome uses their own timers which don't match ours. Not sure what
        // format they use. Therefore we keep track of frame times ourselves
        // and apply the delta to pad gaps.
        this._hrtime = monotonicTime();

        this._writePromise = Promise.resolve();
        this._closePromise = Promise.resolve();
    }

    /**
     * @param {{ width: number, height: number, outputFile: string }} options
     */
    async start(options) {
        const { width, height, outputFile } = options;
        assert(width);
        assert(height);
        assert(outputFile);

        await fs.mkdir(path.dirname(outputFile), { recursive: true });

        // Taken from:
        // https://github.com/microsoft/playwright/blob/e7d4d61442f66f4a861f73c6618af39bf5be4c01/src/server/chromium/videoRecorder.ts#L90
        const ffmpegArgs = `-loglevel error -f image2pipe -c:v mjpeg -i - -y -an -r ${this._fps} -c:v vp8 -qmin 0 -qmax 50 -crf 8 -deadline realtime -b:v 1M -vf pad=${width}:${height}:0:0:gray,crop=${width}:${height}:0:0`;

        this._process = spawn(this.ffmpegPath, [
            ...ffmpegArgs.split(' '),
            options.outputFile,
        ]);

        this._closePromise = new Promise((resolve, reject) => {
            this._process.on('close', code => {
                if (code === 1) {
                    reject(new Error('FFmpeg closed with exit code 1'));
                } else {
                    resolve();
                }
            });
        });

        this._process.on('error', err => {
            console.log(err);
            throw new Error('Failed to spawn "ffmpeg"');
        });

        this._session = await this._page.target().createCDPSession();

        await this._session.send('Page.startScreencast', {
            format: 'jpeg',
            quality: 80,
            maxWidth: width,
            maxHeight: height,
        });

        this._session.on('Page.screencastFrame', this._onFrame.bind(this));
    }

    /**
     * @param {{ sessionId: number, data: string,  metadata: { offsetTop: number, pageScaleFactor: number, deviceWidth: number, deviceHeight: number, scrollOffsetX: number, scrollOffsetY: number, timestamp: number }}} frame
     */
    async _onFrame(frame) {
        try {
            // Confirm to devtools protocol that we received the message
            this._session.send('Page.screencastFrameAck', {
                sessionId: frame.sessionId,
            });
        } catch (err) {
            if (!ignoreError(err)) {
                throw err;
            }
        }

        const { timestamp } = frame.metadata;
        const buffer = Buffer.from(frame.data, 'base64');

        await this._writeFrame(buffer, timestamp);
    }

    /**
     * Write files to buffer and fill time gaps by repeating the
     * last frame. This is necessary to satisfy the fps count.
     * @param {Buffer} buffer
     * @param {number} timestamp
     */
    _writeFrame(buffer, timestamp) {
        this._hrtime = monotonicTime();

        // The browser will only send frames when something has changed.
        // Therefore we need to pad the last frame to meet fps
        // requirements and have the correct video length.
        if (this._lastFrame !== null) {
            const delta = timestamp - this._lastFrame.timestamp;
            const repeat = Math.max(1, Math.round(this._fps * delta));

            for (let i = 0; i < repeat; i++) {
                this._frameQueue.push(this._lastFrame.buffer);
            }

            this._writePromise = this._writePromise.then(() =>
                this._sendFrames()
            );
        }

        this._frameQueue.push(buffer);
        this._lastFrame = { buffer, timestamp };
    }

    /**
     * Send queued frames over to ffmpeg
     */
    async _sendFrames() {
        const frames = this._frameQueue;

        while (frames.length) {
            const frame = frames.shift();

            await new Promise((resolve, reject) => {
                this._process.stdin.write(frame, err => {
                    err ? reject(err) : resolve();
                });
            });
        }
    }

    async stop() {
        assert(this._process);
        if (!this._page.isClosed()) {
            try {
                await this._session.send('Page.stopScreencast');
            } catch (err) {
                if (!ignoreError(err)) {
                    throw err;
                }
            }
        }
        this._session.off('Page.screencastFrame', this._onFrame);

        // Flush remaining frames up until the current time
        if (this._lastFrame !== null) {
            this._writeFrame(
                Buffer.from([]),
                this._lastFrame.timestamp +
                    (monotonicTime() - this._hrtime) / 1000
            );
            await this._sendFrames();
            this._lastFrame = null;
        }

        await new Promise(r => this._process.stdin.end(r));
        await this._closePromise;
    }
}

module.exports = {
    VideoRecorder,
};
