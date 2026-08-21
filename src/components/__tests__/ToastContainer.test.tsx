import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastContainer } from '../ToastContainer';
import { Toast } from '../../store/studioStore';

describe('ToastContainer', () => {
  const sampleToasts: Toast[] = [
    { id: 'toast-1', type: 'info', message: 'Model downloaded successfully' },
    { id: 'toast-2', type: 'error', message: 'Engine failed to initialize' },
  ];

  it('renders active toasts with messages and types', () => {
    const onDismiss = vi.fn();
    render(<ToastContainer toasts={sampleToasts} onDismiss={onDismiss} />);

    expect(screen.getByText('Model downloaded successfully')).toBeInTheDocument();
    expect(screen.getByText('Engine failed to initialize')).toBeInTheDocument();
  });

  it('anchors to the bottom-right by default when drawer is closed', () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <ToastContainer toasts={sampleToasts} onDismiss={onDismiss} drawerOpen={false} />
    );

    const toastWrapper = container.firstChild as HTMLElement;
    expect(toastWrapper.className).toContain('right-[14px]');
    expect(toastWrapper.className).toContain('left-auto');
    expect(toastWrapper.className).not.toContain('left-[20px]');
  });

  it('anchors to the bottom-left when drawer is open to prevent overlapping popups', () => {
    const onDismiss = vi.fn();
    const { container } = render(
      <ToastContainer toasts={sampleToasts} onDismiss={onDismiss} drawerOpen={true} />
    );

    const toastWrapper = container.firstChild as HTMLElement;
    expect(toastWrapper.className).toContain('left-[20px]');
    expect(toastWrapper.className).toContain('right-auto');
  });

  it('invokes onDismiss callback when clicking close button', () => {
    const onDismiss = vi.fn();
    render(<ToastContainer toasts={sampleToasts} onDismiss={onDismiss} />);

    const closeButtons = screen.getAllByRole('button', { name: '×' });
    fireEvent.click(closeButtons[0]);
    expect(onDismiss).toHaveBeenCalledWith('toast-1');
  });
});
