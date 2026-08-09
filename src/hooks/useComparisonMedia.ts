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
    () => /\.(mp4|mkv|mov|avi|webm)$/i.test(realOutputPath),
    [realOutputPath]
  );

  const inputSrc = useMemo(() => getMediaSrc(realInputPath), [realInputPath]);
  const outputSrc = useMemo(() => getMediaSrc(realOutputPath), [realOutputPath]);

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

    v1.play().catch(() => {});
    v2.play().catch(() => {});

    const syncTime = () => {
      if (Math.abs(v1.currentTime - v2.currentTime) > 0.08) {
        v2.currentTime = v1.currentTime;
      }
    };

    v1.addEventListener('timeupdate', syncTime);
    return () => v1.removeEventListener('timeupdate', syncTime);
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
