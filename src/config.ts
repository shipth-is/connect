// Where the page is decides which ShipThis API it talks to and where it sends
// you back to. One build works for develop and prod.

export interface Config {
  apiUrl: string // the ShipThis API, ends in /api/1.0.0
  appOrigin: string // the ShipThis app, where you go back to at the end
}

const CONFIGS: Record<string, Config> = {
  'connect.shipth.is': {
    apiUrl: 'https://api.shipth.is/api/1.0.0',
    appOrigin: 'https://shipth.is',
  },
  'connect.develop.shipth.is': {
    apiUrl: 'https://api.develop.shipth.is/api/1.0.0',
    appOrigin: 'https://develop.shipth.is',
  },
  // Local development - talks to the develop API, goes back to the local app
  localhost: {
    apiUrl: 'https://api.develop.shipth.is/api/1.0.0',
    appOrigin: 'http://localhost:3000',
  },
  '127.0.0.1': {
    apiUrl: 'https://api.develop.shipth.is/api/1.0.0',
    appOrigin: 'http://localhost:3000',
  },
}

// Returns null for any other host - the page shows an error and does nothing
export function getConfig(hostname: string): Config | null {
  return Object.hasOwn(CONFIGS, hostname) ? CONFIGS[hostname] : null
}
