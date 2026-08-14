import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDragDrop } from '../useDragDrop';

type DragDropEvent = { payload: { type: string; paths?: string[] } };
let capturedHandler: ((event: DragDropEvent) => void) | null = null;
const unlistenSpy = vi.fn();

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: (handler: (event: DragDropEvent) => void) => {
      capturedHandler = handler;
      return Promise.resolve(unlistenSpy);
    },
  }),
}));

describe('useDragDrop', () => {
  it('sets isDragOver true while hovering and false on leave', async () => {
    const { result } = renderHook(() => useDragDrop(vi.fn()));
    await waitFor(() => expect(capturedHandler).not.toBeNull());

    act(() => {
      capturedHandler!({ payload: { type: 'enter', paths: [] } });
    });
    expect(result.current.isDragOver).toBe(true);

    act(() => {
      capturedHandler!({ payload: { type: 'leave' } });
    });
    expect(result.current.isDragOver).toBe(false);
  });

  it('forwards only supported media file paths on drop', async () => {
    const onFilesDropped = vi.fn();
    renderHook(() => useDragDrop(onFilesDropped));
    await waitFor(() => expect(capturedHandler).not.toBeNull());

    act(() => {
      capturedHandler!({
        payload: {
          type: 'drop',
          paths: ['C:/photos/a.png', 'C:/docs/readme.txt', 'C:/clips/b.mp4'],
        },
      });
    });

    expect(onFilesDropped).toHaveBeenCalledWith(['C:/photos/a.png', 'C:/clips/b.mp4']);
  });

  it('notifies instead of forwarding when nothing dropped is a supported type', async () => {
    const onFilesDropped = vi.fn();
    const onNotify = vi.fn();
    renderHook(() => useDragDrop(onFilesDropped, onNotify));
    await waitFor(() => expect(capturedHandler).not.toBeNull());

    act(() => {
      capturedHandler!({ payload: { type: 'drop', paths: ['C:/docs/readme.txt'] } });
    });

    expect(onFilesDropped).not.toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith('warning', 'Unsupported File', expect.any(String));
  });

  it('clears isDragOver on drop', async () => {
    const { result } = renderHook(() => useDragDrop(vi.fn()));
    await waitFor(() => expect(capturedHandler).not.toBeNull());

    act(() => {
      capturedHandler!({ payload: { type: 'over' } });
    });
    expect(result.current.isDragOver).toBe(true);

    act(() => {
      capturedHandler!({ payload: { type: 'drop', paths: ['C:/photos/a.png'] } });
    });
    expect(result.current.isDragOver).toBe(false);
  });
});
