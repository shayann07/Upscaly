import React from 'react';

interface ComparisonMediaOverlayProps {
  src: string;
  isVideo: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  panOffset: { x: number; y: number };
  zoom: number;
  isPanning: boolean;
}

export function ComparisonMediaOverlay({
  src,
  isVideo,
  videoRef,
  panOffset,
  zoom,
  isPanning,
}: ComparisonMediaOverlayProps) {
  const mediaContainerStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    transform: `translate3d(${panOffset.x}px, ${panOffset.y}px, 0px) scale3d(${zoom}, ${zoom}, 1)`,
    transformOrigin: 'center center',
    transition: isPanning ? 'none' : 'transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)',
    willChange: 'transform',
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
          className="w-full h-full object-contain pointer-events-none"
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
      />
    </div>
  );
}
