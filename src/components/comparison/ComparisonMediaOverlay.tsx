import React from 'react';

interface ComparisonMediaOverlayProps {
  src: string;
  isVideo: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  panOffset: { x: number; y: number };
  zoom: number;
  isPanning: boolean;
  /**
   * Fires when this layer's video starts. The split view uses it to start
   * the other side in step, so the two halves of the comparison do not
   * drift apart.
   */
  onPlay?: () => void;
}

export function ComparisonMediaOverlay({
  src,
  isVideo,
  videoRef,
  panOffset,
  zoom,
  isPanning,
  onPlay,
}: ComparisonMediaOverlayProps) {
  const mediaContainerStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0px) scale3d(${zoom}, ${zoom}, 1)`,
    transformOrigin: 'center center',
    transition: isPanning ? 'none' : 'transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
    willChange: 'transform',
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  if (!src) return null;

  if (isVideo) {
    return (
      <div style={mediaContainerStyle}>
        <video
          ref={videoRef}
          src={src}
          autoPlay
          loop
          muted
          playsInline
          onPlay={onPlay}
          className="w-full h-full object-contain pointer-events-none"
          style={{ backfaceVisibility: 'hidden' }}
        />
      </div>
    );
  }

  return (
    <div style={mediaContainerStyle}>
      <img
        src={src}
        alt=""
        className="w-full h-full object-contain pointer-events-none select-none"
        draggable={false}
        style={{ backfaceVisibility: 'hidden' }}
      />
    </div>
  );
}
