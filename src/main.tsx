import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import { bootComplete } from './lib/boot';
import './index.css';
import './App.css';

import { studioActions, studioStore } from './store/studioStore';

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).studioStore = studioStore;
  (window as unknown as Record<string, unknown>).studioActions = studioActions;
}

// Errors that escape React entirely (module-init throws, async listeners)
// must still hand the window over -- hidden-forever is the one forbidden state.
window.addEventListener('error', () => bootComplete());
window.addEventListener('unhandledrejection', () => bootComplete());

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);
