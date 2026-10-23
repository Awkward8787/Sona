/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SONA_LLM_URL?: string;
  readonly VITE_SONA_LLM_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorLike {
  readonly error: string;
}

interface BrowserSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface BrowserSpeechRecognitionConstructor {
  new (): BrowserSpeechRecognition;
}

interface Window {
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
}
