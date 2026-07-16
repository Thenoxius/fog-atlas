import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
// The bundled fantasy fonts now dress the UI itself (headings, wordmark),
// not just map labels — load them with the app, not the editor.
import './fonts';

// Real offline support: the service worker caches the shell and assets.
// Production only — in dev it would fight Vite's module server.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(console.error);
  });
}
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
