import * as srp from './srp'

// Placeholder until the page steps (#5). Uses srp.init so the build includes
// all of it, and we can check the bundle has no Buffer or crypto polyfill.
const app = document.getElementById('app')
if (app) app.textContent = `ShipThis connect - SRP ready: ${typeof srp.init === 'function'}`
