import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode removed to avoid double-fetching during local dev (prevents extra API hits).
createRoot(document.getElementById('root')).render(<App />)
