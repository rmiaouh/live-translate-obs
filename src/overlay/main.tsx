import '@fontsource/barlow-condensed/700.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { OverlayApp } from './overlay-app';
import './overlay.css';

const root = document.getElementById('root');
if (!root) throw new Error('Overlay root is missing');

createRoot(root).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>,
);
