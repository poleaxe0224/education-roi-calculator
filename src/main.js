import './styles/main.css';
import { initApp } from './app.js';

initApp();

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/14to17/sw.js').catch(() => {});
  });
}
