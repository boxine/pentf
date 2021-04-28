
/**
 * @param {import('puppeteer').Page} page
 * @param {Array<string | RegExp>} selectors
 * @returns {Element | null}
 */
async function queryElement(page, selectors) {
    const newSelectors = selectors.map(selector => {
        return typeof selector !== 'string'
            ? {source: selector.source, flags: selector.flags}
            : selector;
    });

    return await page.evaluate(selectors => {
        /** @type {Array<Element | Text>} */
        let elements = [document];
        for (let i = 0; i < selectors.length; i++) {
            let selector = selectors[i];

            let j = elements.length;
            while (j--) {
                let element = elements[j];

                // Skip current node if it is a text node and we don't match text next
                if (element.nodeType === Node.TEXT_NODE) {
                    if (typeof selector === 'string' && !selector.startsWith('text=')) {
                        elements.splice(j, 1);
                        continue;
                    }
                }

                let node = /** @type {Element} */ (element);

                if (typeof selector === 'object' || selector.startsWith('text=')) {
                    // eslint-disable-next-line no-undef
                    /** @type {(text: string) => boolean} */
                    let matchFunc;
                    /** @type {null | (text: string) => boolean} */
                    let matchFuncExact = null;

                    if (typeof selector === 'string') {
                        matchFunc = text => text.includes(selector.slice('text='.length));
                    } else {
                        const regexExact = new RegExp(selector.source, selector.flags);
                        matchFuncExact = text => {
                            // Reset regex state in case global flag was used
                            regexExact.lastIndex = 0;
                            return regexExact.test(text);
                        };

                        // Remove leading ^ and ending $, otherwise the traversal
                        // will fail at the first node.
                        const source = selector.source.replace(/^[^]/, '').replace(/[$]$/, '');
                        const regex = new RegExp(source, selector.flags);
                        matchFunc = text => {
                            // Reset regex state in case global flag was used
                            regex.lastIndex = 0;
                            return regex.test(text);
                        };
                    }

                    // `document.textContent` always returns `null`, so we need
                    // to ensure that we're starting with `document.body` instead
                    node = node === document ? document.body : node;
                    const stack = [node];
                    let item = null;
                    let lastFound = null;
                    while ((item = stack.pop())) {
                        for (let k = 0; k < item.childNodes.length; k++) {
                            const child = item.childNodes[k];

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

                    if (!lastFound) {
                        elements.splice(j, 1);
                    } else {
                        elements[j] = lastFound;
                    }
                } else if (/^\.?\/\/[a-zA-z]/.test(selector) || selector.startsWith('xpath=')) {
                    // The double slashes at the start signal that the XPath will always
                    // resolve against the document root. That is not what we want so we
                    // need to make it relative.
                    selector = '.' + selector;
                    const lastFound = document
                        .evaluate(selector, node, null, window.XPathResult.ANY_TYPE, null)
                        .iterateNext();

                    if (!lastFound) {
                        elements.splice(j, 1);
                    } else {
                        elements[j] = lastFound;
                    }
                } else {
                    if (selector.startsWith('testid=')) {
                        const testid = selector.slice('testid='.length);
                        selector = `[data-testid="${testid}"]`;
                    }

                    const result = node.querySelectorAll(selector);

                    if (result.length > 0) {
                        node.querySelectorAll(selector).forEach((child, i) => {
                            if (i > 0) {
                                elements.push(child);
                            } else {
                                elements[j] = child;
                            }
                        });
                    } else {
                        elements.splice(j, 1);
                    }
                }
            }
        }

        // TODO: Support multiple elements
        return elements.length > 0 ? elements[0] : null;
    }, newSelectors);
}

module.exports = {
    queryElement,
};
