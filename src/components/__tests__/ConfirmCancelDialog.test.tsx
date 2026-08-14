import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmCancelDialog } from '../ConfirmCancelDialog';

describe('ConfirmCancelDialog Component', () => {
  it('renders title, message and action buttons when open', () => {
    render(<ConfirmCancelDialog isOpen={true} onConfirm={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText('Cancel Active Upscale?')).toBeInTheDocument();
    expect(
      screen.getByText(/Removing this file will terminate the background engine/)
    ).toBeInTheDocument();
    expect(screen.getByText('Cancel & Free GPU')).toBeInTheDocument();
    expect(screen.getByText('Keep Running')).toBeInTheDocument();
  });

  it('does not render content when isOpen is false', () => {
    render(<ConfirmCancelDialog isOpen={false} onConfirm={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.queryByText('Cancel Active Upscale?')).not.toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const handleConfirm = vi.fn();
    render(<ConfirmCancelDialog isOpen={true} onConfirm={handleConfirm} onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByText('Cancel & Free GPU'));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when cancel button is clicked', () => {
    const handleDismiss = vi.fn();
    render(<ConfirmCancelDialog isOpen={true} onConfirm={vi.fn()} onDismiss={handleDismiss} />);
    fireEvent.click(screen.getByText('Keep Running'));
    expect(handleDismiss).toHaveBeenCalledTimes(1);
  });
});
