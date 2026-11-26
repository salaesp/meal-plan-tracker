import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource-variable/figtree'
import '@fontsource-variable/fraunces/soft.css'
import { App } from './App'
import { AuthGate } from './auth/AuthGate'
import './styles.css'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>{(account) => <App key={account.user?.id ?? 'guest'} account={account} />}</AuthGate>
  </StrictMode>,
)
