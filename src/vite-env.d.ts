/// <reference types="vite/client" />

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;
declare const __LIVE_TRANSLATE_UPDATE_URL__: string;

interface Window {
  liveTranslate: import('./shared/bridge').LiveTranslateBridge;
}
