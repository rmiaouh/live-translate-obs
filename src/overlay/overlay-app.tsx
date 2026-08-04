import { useEffect, useRef, useState } from 'react';
import type { CaptionState, OverlayConfig, OverlayMessage } from '../shared/contracts';
import { OverlayStage } from '../renderer/overlay/OverlayStage';

const DEFAULT_CONFIG: OverlayConfig = {
  theme: 'signal',
  readingMode: 'pages',
  densityPreset: 'balanced',
  fontSizePx: 60,
  textColor: '#F2F7F4',
  hostAccentColor: '#66D9EF',
  guestAccentColor: '#FFB545',
  backgroundOpacity: 0.76,
  position: 'bottom',
  maxWidthPercent: 82,
  maxLines: 2,
  displayDurationMs: 6_000,
  showLabels: true,
};

export function OverlayApp() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [captions, setCaptions] = useState<CaptionState[]>([]);
  const configRef = useRef(config);

  useEffect(() => { configRef.current = config; }, [config]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    let disconnectClearTimer = 0;
    let stopped = false;

    const applyMessage = (message: OverlayMessage) => {
      if (message.type === 'overlay.snapshot') {
        setConfig(message.config);
        setCaptions(message.captions);
      } else if (message.type === 'caption.delta') {
        setCaptions((current) => [
          ...current.filter(({ source }) => source !== message.caption.source),
          message.caption,
        ]);
      } else if (message.type === 'caption.clear') {
        setCaptions((current) => current.filter(({ source }) => source !== message.source));
      } else if (message.type === 'overlay.config') {
        setConfig(message.config);
      }
    };

    const connect = () => {
      if (stopped) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/overlay-events?token=${encodeURIComponent(token)}`);
      socket.addEventListener('open', () => window.clearTimeout(disconnectClearTimer));
      socket.addEventListener('message', ({ data }) => {
        try {
          applyMessage(JSON.parse(String(data)) as OverlayMessage);
        } catch {
          // Technical errors stay invisible on stream.
        }
      });
      socket.addEventListener('close', () => {
        if (stopped) return;
        reconnectTimer = window.setTimeout(connect, 1_500);
        disconnectClearTimer = window.setTimeout(
          () => setCaptions([]),
          configRef.current.displayDurationMs,
        );
      });
      socket.addEventListener('error', () => socket?.close());
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      window.clearTimeout(disconnectClearTimer);
      socket?.close();
    };
  }, []);

  return <OverlayStage captions={captions} config={config} transparent />;
}
