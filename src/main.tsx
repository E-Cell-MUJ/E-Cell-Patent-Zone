/**
 * Manipal University Jaipur — Patent Application & Disclosure Portal
 * Lead Architect & Maintainer: SynthReaper <codewithaditya8002@gmail.com>
 * Directorate of Research & IPR Cell • E-CELL MUJ
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import './styles/design-system.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
