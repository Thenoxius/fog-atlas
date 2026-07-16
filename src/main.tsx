import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
// The bundled fantasy fonts now dress the UI itself (headings, wordmark),
// not just map labels — load them with the app, not the editor.
import './fonts';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
