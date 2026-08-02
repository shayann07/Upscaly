import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Titlebar } from '../Titlebar';

describe('Titlebar Component', () => {
  it('renders app name and version badge', () => {
    render(<Titlebar statusText="Vulkan Engine Ready" />);
    expect(screen.getByText('Upscaly')).toBeInTheDocument();
    expect(screen.getByText('v1.0')).toBeInTheDocument();
    expect(screen.getByText('Vulkan Engine Ready')).toBeInTheDocument();
  });

  it('triggers sound mute toggle on button click', () => {
    const handleToggle = vi.fn();
    render(<Titlebar statusText="Ready" isMuted={false} onToggleMute={handleToggle} />);
    const muteButton = screen.getByTitle('Mute Sound FX');
    fireEvent.click(muteButton);
    expect(handleToggle).toHaveBeenCalledTimes(1);
  });
});
