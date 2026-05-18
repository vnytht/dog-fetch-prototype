import React from 'react';
import ReactDOM from 'react-dom/client';
import Clarity from '@microsoft/clarity';
import { App } from './App';
import './styles.css';

const clarityProjectId = import.meta.env.VITE_CLARITY_PROJECT_ID;

if (clarityProjectId) {
  Clarity.init(clarityProjectId);
  Clarity.setTag('app', 'bruce');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
