import { useState, useEffect, useMemo, useRef } from 'react';
import { getMediaSrc } from '../lib/media';

interface UseComparisonMediaOptions {
  inputPath?: string;
  outputPath?: string;
  originalPath?: string;
  upscaledPath?: string;
  mode?: 'split' | 'side';
  viewMode?: 'split' | 'side-by-side';
}

export function useComparisonMedia({
  inputPath,
  outputPath,
  originalPath,
  upscaledPath,
  mode = 'split',
  viewMode,
}: UseComparisonMediaOptions) {
  const videoInputRef = useRef<HTMLVideoElement>(null);
  const videoOutputRef = useRef<HTMLVideoElement>(null);

  const [inputDims, setInputDims] = useState<{ w: number; h: number } | null>(null);
  const [outputDims, setOutputDims] = useState<{ w: number; h: number } | null>(null);

  const realInputPath = inputPath || originalPath || '';
  const realOutputPath = outputPath || upscaledPath || '';
  const activeMode = viewMode === 'side-by-side' ? 'side' : mode;

  const isVideoInput = useMemo(
    () => /\.(mp4|mkv|mov|avi|webm)$/i.test(realInputPath),
    [realInputPath]
  );
  const isVideoOutput = useMemo(
    () => (realOutputPath ? /\.(mp4|mkv|mov|avi|webm)$/i.test(realOutputPath) : isVideoInput),
    [realOutputPath, isVideoInput]
  );

  const inputSrc = useMemo(() => getMediaSrc(realInputPath), [realInputPath]);
  const outputSrc = useMemo(
    () => (realOutputPath ? getMediaSrc(realOutputPath) : inputSrc),
    [realOutputPath, inputSrc]
  );

  useEffect(() => {
    setInputDims(null);
    setOutputDims(null);
  }, [inputSrc, outputSrc]);

  useEffect(() => {
    let isMounted = true;

    if (inputSrc) {
      if (isVideoInput) {
        const vid1 = document.createElement('video');
        vid1.onloadedmetadata = () => {
          if (isMounted) setInputDims({ w: vid1.videoWidth, h: vid1.videoHeight });
        };
        vid1.src = inputSrc;
      } else {
        const img1 = new Image();
        img1.onload = () => {
          if (isMounted) setInputDims({ w: img1.naturalWidth, h: img1.naturalHeight });
        };
        img1.src = inputSrc;
      }
    }

    if (outputSrc) {
      if (isVideoOutput) {
        const vid2 = document.createElement('video');
        vid2.onloadedmetadata = () => {
          if (isMounted) setOutputDims({ w: vid2.videoWidth, h: vid2.videoHeight });
        };
        vid2.src = outputSrc;
      } else {
        const img2 = new Image();
        img2.onload = () => {
          if (isMounted) setOutputDims({ w: img2.naturalWidth, h: img2.naturalHeight });
        };
        img2.src = outputSrc;
      }
    }

    return () => {
      isMounted = false;
    };
  }, [inputSrc, outputSrc, isVideoInput, isVideoOutput]);

  useEffect(() => {
    const v1 = videoInputRef.current;
    const v2 = videoOutputRef.current;
    if (!v1 || !v2) return;

    let isSeeking = false;
    let lastSeekTime = 0;

    const handlePlay = () => {
      v2.play().catch(() => {});
    };

    const handlePause = () => {
      v2.pause();
      v2.currentTime = v1.currentTime;
    };

    const handleSeeking = () => {
      isSeeking = true;
      v2.currentTime = v1.currentTime;
    };

    const handleSeeked = () => {
      isSeeking = false;
      v2.currentTime = v1.currentTime;
    };

    const handleTimeUpdate = () => {
      if (isSeeking) return;
      const now = Date.now();
      const drift = Math.abs(v1.currentTime - v2.currentTime);
      // Only resync if playback drift exceeds 350ms and we haven't resynced in the last 1.5s
      if (drift > 0.35 && now - lastSeekTime > 1500) {
        lastSeekTime = now;
        v2.currentTime = v1.currentTime;
      }
    };

    v1.addEventListener('play', handlePlay);
    v1.addEventListener('pause', handlePause);
    v1.addEventListener('seeking', handleSeeking);
    v1.addEventListener('seeked', handleSeeked);
    v1.addEventListener('timeupdate', handleTimeUpdate);

    v1.play().catch(() => {});
    v2.play().catch(() => {});

    return () => {
      v1.removeEventListener('play', handlePlay);
      v1.removeEventListener('pause', handlePause);
      v1.removeEventListener('seeking', handleSeeking);
      v1.removeEventListener('seeked', handleSeeked);
      v1.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [inputSrc, outputSrc, activeMode]);

  return {
    videoInputRef,
    videoOutputRef,
    inputDims,
    outputDims,
    activeMode,
    isVideoInput,
    isVideoOutput,
    inputSrc,
    outputSrc,
  };
}
