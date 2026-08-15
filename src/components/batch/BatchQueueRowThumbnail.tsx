import { QueueItem } from '../../store/queueItem';
import { getMediaSrc } from '../../lib/media';

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
  const itemPath = file.filePath;
  const itemSrc = itemPath ? getMediaSrc(itemPath) : '';

  return (
    <div
      className="flex-none relative overflow-hidden bg-[#1B1917]"
      style={{
        width: open ? (active ? 44 : 40) : 46,
        height: open ? (active ? 44 : 40) : 46,
        border: `1px solid ${active ? accentColor : open ? 'var(--border-default)' : '#3E3933'}`,
        borderRadius: open ? 9 : 11,
        boxShadow: open
          ? 'none'
          : active
            ? '0 12px 30px rgba(0,0,0,.7)'
            : '0 6px 18px rgba(0,0,0,.5)',
        transition: `all .24s ${EASE}`,
      }}
    >
      {itemSrc && !file.isVideo ? (
        <img src={itemSrc} alt="" className="w-full h-full object-cover" />
      ) : null}
      <span
        className="absolute bottom-0 left-0 right-0 py-[1px] text-center bg-[rgba(11,10,9,.8)] font-['Martian_Mono',monospace] text-[7px] tracking-[0.06em]"
        style={{ color: col }}
      >
        {file.isVideo ? 'VID' : 'IMG'}
      </span>
    </div>
  );
}
