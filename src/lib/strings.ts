/**
 * Centralized user-facing strings for Upscaly Studio.
 *
 * All user-facing copy is externalized here to prepare for localization and
 * maintain single-source-of-truth text across platforms.
 */
export const STRINGS = {
  // App
  APP_TITLE: 'Upscaly Studio',
  APP_DESCRIPTION:
    'Local image and video upscaling on Vulkan. Your media never leaves the machine — the only network requests Upscaly Studio makes are for model weights you choose to download and its own update check.',

  // DropZone
  DROP_IDLE: 'Drop media to upscale',
  DROP_ACTIVE: 'Release to queue',
  DROP_SUBTITLE: 'Images or video, a single file or a whole folder. Nothing leaves your machine.',
  DROP_FORMATS: 'PNG JPG WEBP \u00A0·\u00A0 MP4 MKV MOV',
  CHOOSE_FILES: 'Choose files',
  CHOOSE_FOLDER: 'Folder',

  // Upscale Button & Actions
  UPSCALE_MEDIA: 'Upscale Media',
  PROCESSING: 'Processing...',
  CANCEL_AND_FREE_GPU: 'Cancel & Free GPU',
  KEEP_RUNNING: 'Keep Running',
  CANCEL_TITLE: 'Cancel Active Upscale?',
  CANCEL_MESSAGE:
    'An upscaling job is currently in progress. Removing this file will terminate the background engine and release all GPU VRAM resources.',

  // Comparison & Preview
  ORIGINAL: 'ORIGINAL',
  UPSCALED: 'UPSCALED',
  SPLIT_VIEW: 'Split',
  SIDE_VIEW: 'Side by Side',
  VIEW_MODE: 'View Mode',
  ZOOM: 'Zoom',

  // Completion
  OPEN_OUTPUT: 'Open',
  RESET_VIEW: 'Reset',
  CLEAR_ALL: 'Clear All',

  // Selects & Dropdowns
  SELECT_OPTION: 'Select option...',
  NO_OPTIONS: 'No options available',

  // Settings & Navigation
  SETTINGS: 'SETTINGS',
  SHORTCUTS_AND_INFO: 'SHORTCUTS & INFO',
  MODELS: 'MODELS',
  RECENT_HISTORY: 'RECENT HISTORY',
  SHORTCUTS: 'SHORTCUTS',
  VERSION: 'VERSION',
  CHECK_FOR_UPDATES: 'CHECK FOR UPDATES',
  CHECKING_UPDATES: 'CHECKING…',
  CLOSE: 'Close',
} as const;

export type StringKey = keyof typeof STRINGS;
