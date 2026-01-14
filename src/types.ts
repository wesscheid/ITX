export const AppStatus = {
  IDLE: 'IDLE',
  DOWNLOADING: 'DOWNLOADING',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR'
} as const;

export type AppStatus = typeof AppStatus[keyof typeof AppStatus];

export interface ProcessingResult {
  originalText: string;
  translatedText: string;
  language: string;
  title?: string;
  sourceUrl?: string;
}

export interface LanguageOption {
  code: string;
  name: string;
}

export interface ProcessingProgress {
  stage: 'downloading' | 'processing' | 'transcribing' | 'complete';
  percentage: number;
  message: string;
}

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'zh', name: 'Chinese (Simplified)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ru', name: 'Russian' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
];