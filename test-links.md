# Link Test

This file tests that all links open in a new tab.

## External Links

- [Google](https://google.com)
- [GitHub](https://github.com)
- [MDN Web Docs](https://developer.mozilla.org)

## Markdown Link Syntax

Here's a link in a paragraph: [Visit Example.com](https://example.com) for more information.

### Reference Style Links

Check out [this resource][1] and [that one][2].

[1]: https://www.wikipedia.org
[2]: https://www.stackoverflow.com

### Autolinks

<https://www.reddit.com>

## Test Instructions

1. Load this file in the markdown editor
2. Click any link in the preview pane
3. Verify that each link opens in a **new tab**
4. Check browser dev tools to confirm links have `target="_blank"` and `rel="noopener noreferrer"`

### Security Note

The `rel="noopener noreferrer"` attribute is added for security to prevent the new page from accessing the `window.opener` object.

