import { render, screen } from '@testing-library/react';
import { Titlebar } from '../Titlebar';
import { describe, it, expect, vi } from 'vitest';

describe('Titlebar Component', () => {
  it('renders app name', () => {
    render(
      <Titlebar onShowModelCatalog={vi.fn()} onShowSettings={vi.fn()} onShowAbout={vi.fn()} />
    );
    expect(screen.getByText(/Upscaly/i)).toBeInTheDocument();
  });
});
