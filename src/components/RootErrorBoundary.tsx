import { Component, type ErrorInfo, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { bootComplete } from '../lib/boot';

/**
 * Last line of defence for render throws. The window is created hidden and
 * has no OS decorations, so an unmounted tree is not "a broken page" -- it
 * is an invisible window the user cannot reach or close. This boundary
 * forces the boot hand-over (which shows the window) and renders a way out.
 */
export class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    bootComplete();
    console.error('Fatal render error:', error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          alignContent: 'center',
          gap: 12,
          background: '#0B0A09',
          color: '#F2F0ED',
          fontFamily: 'Archivo, sans-serif',
        }}
      >
        <div
          data-tauri-drag-region
          style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 36 }}
        />
        <div>Upscaly Studio hit an unrecoverable error.</div>
        <pre style={{ maxWidth: '80vw', overflow: 'auto', fontSize: 11, color: '#6B655E' }}>
          {String(this.state.error?.message ?? this.state.error)}
        </pre>
        <button onClick={() => void invoke('close_window').catch(() => {})}>
          Close Upscaly Studio
        </button>
      </div>
    );
  }
}
