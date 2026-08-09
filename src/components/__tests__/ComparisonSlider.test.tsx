import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ComparisonSlider } from '../ComparisonSlider';

describe('ComparisonSlider Component', () => {
  it('renders slider viewport and image labels', () => {
    render(<ComparisonSlider originalPath="test.png" upscaledPath="test_upscaled.png" />);
    expect(screen.getByText(/ORIGINAL/i)).toBeInTheDocument();
    expect(screen.getByText(/UPSCALED/i)).toBeInTheDocument();
  });
});
