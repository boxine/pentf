/**
 * Find an element via an xpath string.
 * @param {string} xpath The XPath to search for
 * @returns {Element | Text | null}
 */
function findByXPath(xpath) {
    return document
        .evaluate(xpath, document, null, window.XPathResult.ANY_TYPE, null)
        .iterateNext();
}

/**
 * Find an element that includes the given text or matches the RegExp.
 * @param {string | RegExp} matcher The text or RegExp to look for.
 * @returns {Element | null}
 */
function findByText(matcher) {
    // eslint-disable-next-line no-undef
    /** @type {(text: string) => boolean} */
    let matchFunc;
    /** @type {null | (text: string) => boolean} */
    let matchFuncExact = null;

    if (typeof matcher == 'string') {
        matchFunc = text => text.includes(matcher);
    } else {
        matchFuncExact = text => {
            // Reset regex state in case global flag was used
            matcher.lastIndex = 0;
            return matcher.test(text);
        };

        // Remove leading ^ and ending $, otherwise the traversal
        // will fail at the first node.
        const source = matcher.source.replace(/^[^]/, '').replace(/[$]$/, '');
        const regex = new RegExp(source, matcher.flags);
        matchFunc = text => {
            // Reset regex state in case global flag was used
            regex.lastIndex = 0;
            return regex.test(text);
        };
    }

    const stack = [document.body];
    let item = null;
    /** @type {ChildNode | null} */
    let lastFound = null;
    while ((item = stack.pop())) {
        for (let i = 0; i < item.childNodes.length; i++) {
            const child = item.childNodes[i];

            // Skip text nodes as they are not clickable
            if (child.nodeType === Node.TEXT_NODE) {
                continue;
            }

            const text = child.textContent || '';
            if (child.childNodes.length > 0 && matchFunc(text)) {
                if (matchFuncExact === null || matchFuncExact(text)) {
                    lastFound = child;
                }
                stack.push(child);
            }
        }
    }

    return lastFound;
}

/**
 * Get the actual center coordinates of a given element relative
 * to the viewport. This can be used to simulate an actual mouse click
 * from puppeteer's side.
 * @param {Element | Text} element
 * @returns {Promise<{ x: number, y: number }>}
 */
async function getCenterCoordinates(element) {
    /** @type {DOMRect} */
    let rect;

    // Text nodes don't have `getBoundingClientRect()`, but
    // we can use range objects for that.
    if (element.nodeType === Node.TEXT_NODE) {
        // Element may be hidden in a scroll container
        element.parentNode.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});

        const visibleRatio = await new Promise(resolve => {
            const observer = new IntersectionObserver(entries => {
                resolve(entries[0].intersectionRatio);
                observer.disconnect();
            });
            observer.observe(element.parentNode);
        });
        if (visibleRatio !== 1.0) {
            element.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
        }

        const range = document.createRange();
        range.selectNodeContents(element);

        const rects = range.getClientRects();
        if (!rects || rects.length < 1) {
            throw new Error(`Could not determine Text node coordinates of "${element.data}"`);
        }

        rect = rects[0];
    } else {
        // Element may be hidden in a scroll container
        element.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
        const visibleRatio = await new Promise(resolve => {
            const observer = new IntersectionObserver(entries => {
                resolve(entries[0].intersectionRatio);
                observer.disconnect();
            });
            observer.observe(element);
        });
        if (visibleRatio !== 1.0) {
            element.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
        }

        rect = /** @type {Element} */ (element).getBoundingClientRect();
    }

    let x = rect.x + rect.width / 2;
    let y = rect.y + rect.height / 2;

    // Account for offset of the current frame if we are inside an iframe
    let win = window;
    let parentWin = null;
    while (win !== window.top) {
        parentWin = win.parent;

        const iframe = Array.from(parentWin.document.querySelectorAll('iframe')).find(
            f => f.contentWindow === win
        );
        if (iframe) {
            const iframeRect = iframe.getBoundingClientRect();
            x += iframeRect.x;
            y += iframeRect.y;
            break;
        }
    }
    return {x, y};
}

/**
 * Default function to call for most matchers.
 * @param {Element | Text | null} element
 * @param {{ visible?: boolean, click?: boolean }} [options]
 * @returns {{ x: number, y: number} | null | false}
 *   false -> element not found
 *   null  -> element is invisible, but we expected it to be visible
 *   {x,y} -> center coordinates of elements to later click on
 *   true  -> element is invisible and we likely clicked it
 */
function processResult(node, { visible, click } = {}) {
    if (!node) return false;
    if (visible) {
        const element = node.nodeType === Node.TEXT_NODE
            ? node.parentNode
            : node;

        if (!element || element.offsetParent === null) {
            return null;
        }

        return getCenterCoordinates(element);
    }

    if (click) {
        // We can't use the mouse to click on invisible elements.
        // Therefore invoke the click handler on the DOM node directly.
        node.click();
    }
    return true;
}

window._pentf = {
    processResult,
    findByText,
    findByXPath,
    getCenterCoordinates,
};
