import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SecureBallotApp from './SecureBallotApp';
import './ui.css';

createRoot(document.getElementById('ui-root')!).render(
  <StrictMode>
    <SecureBallotApp />
  </StrictMode>,
);
