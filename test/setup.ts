// The browser build of @foxt/js-srp reads `self.crypto`, which Node does not have
if (typeof self === 'undefined') Object.assign(globalThis, {self: globalThis})
