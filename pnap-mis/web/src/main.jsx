import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { UnitProvider } from './context/UnitContext.jsx';
import './styles.css';

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (
      (event.filename && event.filename.includes('chrome-extension://')) ||
      (event.message && event.message.includes('M_ID'))
    ) {
      event.stopImmediatePropagation();
      event.preventDefault();
    }
  }, true);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UnitProvider>
          <App />
        </UnitProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
