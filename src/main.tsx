import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioServicesProvider } from './audio/AudioServicesContext';
import { createBrowserAudioServices } from './audio/services';
import { App } from './components/App';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root element');

createRoot(rootElement).render(
  <StrictMode>
    <AudioServicesProvider services={createBrowserAudioServices()}>
      <App />
    </AudioServicesProvider>
  </StrictMode>,
);
