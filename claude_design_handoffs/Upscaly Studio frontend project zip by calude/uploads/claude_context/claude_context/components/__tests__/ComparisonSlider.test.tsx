import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ComparisonSlider } from '../ComparisonSlider';

describe('ComparisonSlider Component', () => {
  it('renders slider viewport and zoom controls', () => {
    render(<ComparisonSlider originalPath="test.png" upscaledPath="test_upscaled.png" />);
    expect(screen.getByText(/compare/i)).toBeInTheDocument();
    expect(screen.getByText('1x Zoom')).toBeInTheDocument();
  });

  it('toggles zoom level on zoom button click', () => {
    render(<ComparisonSlider originalPath="test.png" upscaledPath="test_upscaled.png" />);
    const zoomBtn = screen.getByText('1x Zoom');
    fireEvent.click(zoomBtn);
    expect(screen.getByText('2x Zoom')).toBeInTheDocument();
  });
});
