import {createRoot} from 'react-dom/client'

import {setApiUrl} from './api'
import {App} from './App'
import {getConfig} from './config'
import {readLink} from './link'

const root = createRoot(document.getElementById('app')!)
const config = getConfig(location.hostname)

if (config) {
  setApiUrl(config.apiUrl)
  const {token, returnUrl} = readLink(config.appOrigin)
  root.render(<App token={token} returnUrl={returnUrl} navigate={(url) => location.replace(url)} />)
} else {
  root.render(
    <div>
      <h1>Something is wrong</h1>
      <p>This page is not configured for this address.</p>
    </div>,
  )
}
