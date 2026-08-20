import { useState, useEffect } from 'react';
import { QueueItem } from '../../store/queueItem';
import { getThumbnail } from '../../lib/thumbnailCache';

interface BatchQueueRowThumbnailProps {
  file: QueueItem;
  open: boolean;
  active: boolean;
  accentColor: string;
  EASE: string;
  col: string;
}

export function BatchQueueRowThumbnail({
  file,
  open,
  active,
  accentColor,
  EASE,
  col,
}: BatchQueueRowThumbnailProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const running = file.status === 'running';
  const failed = file.status === 'failed';

  useEffect(() => {
    let activeEffect = true;
    setLoadFailed(false);
    if (!file.filePath) {
      setThumbUrl(null);
      return;
    }

    getThumbnail(file.filePath, file.isVideo).then((url) => {
      if (activeEffect) {
        setThumbUrl(url);
      }
    });

    return () => {
      activeEffect = false;
    };
  }, [file.filePath, file.isVideo]);

  return (
    <div
      className="flex-none relative overflow-hidden bg-[#1B1917]"
      style={{
        width: open ? (active ? 44 : 40) : 46,
        height: open ? (active ? 44 : 40) : 46,
        border: `1px solid ${failed ? 'var(--danger-text)' : active ? accentColor : open ? 'var(--border-default)' : '#3E3933'}`,
        borderRadius: open ? 9 : 11,
        boxShadow: open
          ? 'none'
          : active
            ? '0 12px 30px rgba(0,0,0,.7)'
            : '0 6px 18px rgba(0,0,0,.5)',
        // Same reasoning as the row: name the properties instead of
        // animating `all` on a tile that re-renders every progress tick.
        transition: `width .24s ${EASE}, height .24s ${EASE}, border-color .18s ease, border-radius .24s ${EASE}`,
      }}
    >
      {thumbUrl && !loadFailed ? (
        file.isVideo && !thumbUrl.startsWith('data:') && !thumbUrl.startsWith('blob:') ? (
          <video
            src={`${thumbUrl}#t=0.001`}
            preload="metadata"
            muted
            playsInline
            onError={() => setLoadFailed(true)}
            className="w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setLoadFailed(true)}
            className="w-full h-full object-cover pointer-events-none"
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[#5A544C]">
          {file.isVideo ? (
            <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
          )}
        </div>
      )}

      {/*
        Collapsed, the rail is nothing but these tiles, so progress has to
        live inside one. A dim scrim rises from the base to the completed
        fraction: legible at 46px, and clipped by the tile's own rounded
        overflow so it can never render as a stray line outside it -- which
        is exactly what the previous row-width absolute bar did.
      */}
      {running && (
        <div
          className="absolute inset-x-0 bottom-0 pointer-events-none"
          style={{
            height: `${Math.max(0, Math.min(100, file.progress))}%`,
            background: 'linear-gradient(to top, rgba(168,11,36,.55), rgba(168,11,36,.12))',
            borderTop: `1px solid ${accentColor}`,
            transition: 'height .25s linear',
          }}
        />
      )}

      <span
        className="absolute bottom-0 left-0 right-0 py-[1px] text-center bg-[rgba(11,10,9,.8)] font-['Martian_Mono',monospace] text-[7px] tracking-[0.06em]"
        style={{ color: col }}
      >
        {failed ? 'FAIL' : file.isVideo ? 'VID' : 'IMG'}
      </span>
    </div>
  );
}
