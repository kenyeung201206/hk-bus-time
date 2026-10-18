import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { fontsHref } from './themes';
import './styles.css';

// cute fonts for the three patterns (system fonts are used until they load / when offline)
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = fontsHref();
document.head.appendChild(link);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
