import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SettingsPanel } from '../SettingsPanel';
import { SUPPORTED_MODELS } from '../../lib/types';

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
    expect(screen.getByText('Photo')).toBeInTheDocument();
    expect(screen.getByText('Anime')).toBeInTheDocument();
    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(screen.getByText('RealESRGAN Ultra')).toBeInTheDocument();
  });

  it('fires scale selection callback on click', () => {
    const onSelectScale = vi.fn();
    render(<SettingsPanel {...defaultProps} onSelectScale={onSelectScale} />);
    // 4x, not 2x: the selected model is a photo model and nothing
    // photographic runs at 2x, so that pill is disabled -- see below.
    fireEvent.click(screen.getByText('4×'));
    expect(onSelectScale).toHaveBeenCalledWith(4);
  });

  it('disables factors no model in the category can produce', () => {
    // The bug this guards: clicking 2x on a photo model set the pill to 2x
    // but kept the 4x model, so the control read 2x while the job ran at 4x
    // and only a toast said otherwise. An unreachable factor must be
    // unclickable, not clickable-then-overridden.
    const onSelectScale = vi.fn();
    render(<SettingsPanel {...defaultProps} onSelectScale={onSelectScale} />);

    const scale2xBtn = screen.getByText('2×');
    expect(scale2xBtn).toBeDisabled();

    fireEvent.click(scale2xBtn);
    expect(onSelectScale).not.toHaveBeenCalled();
  });

  it('unlocks a factor that only a custom model provides', () => {
    // The gate must follow the live catalog, never a hardcoded table. A
    // user-supplied 2x photo model arrives through the same `supportedModels`
    // list with its scale parsed from the .param file, so dropping one in has
    // to re-enable 2x for photos -- otherwise importing a custom model would
    // leave the factor it exists to provide permanently greyed out.
    const onSelectScale = vi.fn();
    const withCustom = [
      ...SUPPORTED_MODELS,
      {
        id: 'my-custom-2x',
        name: 'My Custom 2x',
        note: '',
        cat: 'photo' as const,
        scale: 2,
        size: '4.0 MB',
        speed: 1,
      },
    ];

    render(
      <SettingsPanel {...defaultProps} supportedModels={withCustom} onSelectScale={onSelectScale} />
    );

    const scale2xBtn = screen.getByText('2×');
    expect(scale2xBtn).not.toBeDisabled();

    fireEvent.click(scale2xBtn);
    expect(onSelectScale).toHaveBeenCalledWith(2);
  });

  it('leaves a factor enabled when a model in the category produces it', () => {
    // The video category ships realesr-animevideov3 at x2, x3 and x4, so the
    // same pill stays live for a video model. The rule is per-category, not
    // a blanket ban on 2x -- and it keys off the *selected model's* category
    // rather than the active tab, which is what `selectScale` swaps within.
    const onSelectScale = vi.fn();
    render(
      <SettingsPanel
        {...defaultProps}
        category="video"
        selectedModel="realesr-animevideov3-x4"
        onSelectScale={onSelectScale}
      />
    );

    const scale2xBtn = screen.getByText('2×');
    expect(scale2xBtn).not.toBeDisabled();

    fireEvent.click(scale2xBtn);
    expect(onSelectScale).toHaveBeenCalledWith(2);
  });
});
