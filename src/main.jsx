import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

if (import.meta.env.PROD) {
  console.log = () => { };
  console.warn = () => { };
  console.error = () => { }; // Opcional: a veces es útil dejar errores críticos, pero esto limpia todo
  console.info = () => { };
  console.debug = () => { };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)