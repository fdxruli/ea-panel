import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

const noop = () => {};

if (import.meta.env.PROD) {
  globalThis.console.log = noop;
  globalThis.console.info = noop;
  globalThis.console.debug = noop;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
