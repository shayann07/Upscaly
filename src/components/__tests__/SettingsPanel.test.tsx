import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SettingsPanel } from '../SettingsPanel';

describe('SettingsPanel Component', () => {
  const defaultProps = {
    category: 'photos' as const,
    onSelectCategory: vi.fn(),
    installedModels: ['realesrgan-x4plus', 'realesrgan-x4plus-anime'],
    selectedModel: 'realesrgan-x4plus',
    onSelectModel: vi.fn(),
    scale: 4,
    onSelectScale: vi.fn(),
  };

  it('renders category options and models', () => {
    render(<SettingsPanel {...defaultProps} />);
    expect(screen.getByText('Photos')).toBeInTheDocument();
    expect(screen.getByText('Anime & Art')).toBeInTheDocument();
    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(screen.getByText('realesrgan-x4plus')).toBeInTheDocument();
  });

  it('fires scale selection callback on click', () => {
    const onSelectScale = vi.fn();
    render(<SettingsPanel {...defaultProps} onSelectScale={onSelectScale} />);
    const scale2xBtn = screen.getByText(/2x/);
    fireEvent.click(scale2xBtn);
    expect(onSelectScale).toHaveBeenCalledWith(2);
  });
});
