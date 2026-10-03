import { createContext, useContext, type ReactNode } from 'react';
import type { AudioServices } from './services';

const AudioServicesContext = createContext<AudioServices | null>(null);

export interface AudioServicesProviderProps {
  services: AudioServices;
  children?: ReactNode;
}

export function AudioServicesProvider({ services, children }: AudioServicesProviderProps): JSX.Element {
  return <AudioServicesContext.Provider value={services}>{children}</AudioServicesContext.Provider>;
}

// The provider and its hook belong together; fast refresh of this tiny module is not a concern.
// eslint-disable-next-line react-refresh/only-export-components
export function useAudioServices(): AudioServices {
  const services = useContext(AudioServicesContext);
  if (!services) {
    throw new Error('useAudioServices must be used inside an <AudioServicesProvider>');
  }
  return services;
}
