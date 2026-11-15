import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';
import './styles/home.css';
import './styles/pages.css';
import './styles/system.css';
import './styles/nav.css';
import './styles/features.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
