import { render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AudioServicesProvider, useAudioServices } from './AudioServicesContext';
import type { AudioServices } from './services';

function fakeServices(): AudioServices {
  return {
    unlock: vi.fn(),
    openMicrophone: vi.fn(),
    playMelody: vi.fn(),
    detectPitch: vi.fn(() => null),
  };
}

describe('AudioServicesContext', () => {
  it('useAudioServices returns the provided services', () => {
    const services = fakeServices();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AudioServicesProvider services={services}>{children}</AudioServicesProvider>
    );
    const { result } = renderHook(() => useAudioServices(), { wrapper });
    expect(result.current).toBe(services);
  });

  it('useAudioServices throws a helpful error without a provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useAudioServices())).toThrow(/AudioServicesProvider/);
  });

  it('renders its children', () => {
    render(
      <AudioServicesProvider services={fakeServices()}>
        <p>child</p>
      </AudioServicesProvider>,
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});
