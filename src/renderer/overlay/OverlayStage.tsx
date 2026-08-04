import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  CAPTION_CATCHUP_MIN_MS,
  normalizeCaptionText,
  paginateCaptionText,
  readingDurationMs,
} from '../../shared/caption-layout';
import { orderCaptionCards } from '../../shared/caption-order';
import type { CaptionState, CaptureProfile, OverlayConfig } from '../../shared/contracts';
import './overlay-stage.css';

const CANVAS_WIDTH = 1_920;
const CANVAS_HEIGHT = 1_080;

export interface OverlayStageProps {
  captions: CaptionState[];
  config: OverlayConfig;
  profile?: CaptureProfile;
  emptyText?: string;
  showGuides?: boolean;
  className?: string;
  transparent?: boolean;
}

export function OverlayStage({
  captions,
  config,
  profile,
  emptyText,
  showGuides = false,
  className = '',
  transparent = false,
}: OverlayStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const update = () => {
      const bounds = frame.getBoundingClientRect();
      setScale(Math.max(0.01, Math.min(bounds.width / CANVAS_WIDTH, bounds.height / CANVAS_HEIGHT)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const visible = captions.filter((caption) => normalizeCaptionText(caption.text));
  const content = visible.length
    ? visible
    : emptyText
      ? [placeholderCaption(emptyText)]
      : [];
  const ordered = orderCaptionCards(content);

  const canvasStyle = {
    '--caption-size': `${config.fontSizePx}px`,
    '--caption-width': `${config.maxWidthPercent}%`,
    '--caption-bg': config.backgroundOpacity,
    '--caption-color': config.textColor,
    '--canvas-scale': scale,
  } as CSSProperties;

  return (
    <div
      ref={frameRef}
      className={`lt-overlay-frame ${transparent ? 'is-transparent' : ''} ${className}`}
    >
      <div
        className={`lt-overlay-canvas position-${config.position} theme-${config.theme} reading-${config.readingMode}`}
        style={canvasStyle}
      >
        {showGuides && <div className="safe-guides" aria-hidden="true"><span>SAFE 90%</span></div>}
        <div className="caption-stack" aria-label="Caption preview">
          {ordered.map((caption) => (
            <CaptionCard
              key={caption.utteranceId}
              caption={caption}
              config={config}
              profile={profile}
              placeholder={caption.utteranceId === 'placeholder'}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CaptionCard({ caption, config, profile, placeholder }: {
  caption: CaptionState;
  config: OverlayConfig;
  profile?: CaptureProfile;
  placeholder: boolean;
}) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const shellRef = useRef<HTMLSpanElement>(null);
  const [measureRevision, setMeasureRevision] = useState(0);
  const [pages, setPages] = useState<string[]>(() => [normalizeCaptionText(caption.text)]);
  const [pageIndex, setPageIndex] = useState(0);
  const pageStartedAt = useRef(Date.now());
  const previousUtterance = useRef('');

  useLayoutEffect(() => {
    const measure = measureRef.current;
    if (!measure) return;
    const next = paginateCaptionText(caption.text, (candidate) => {
      measure.textContent = candidate;
      const style = getComputedStyle(measure);
      const lineHeight = Number.parseFloat(style.lineHeight) || config.fontSizePx * 1.18;
      return measure.scrollHeight <= lineHeight * config.maxLines + 1;
    });
    const safePages = next.length ? next : [''];
    setPages(safePages);
    setPageIndex((current) => {
      if (previousUtterance.current !== caption.utteranceId) {
        previousUtterance.current = caption.utteranceId;
        pageStartedAt.current = Date.now();
        return Date.now() - caption.receivedAt > 1_200 ? safePages.length - 1 : 0;
      }
      return Math.min(current, safePages.length - 1);
    });
  }, [caption.receivedAt, caption.text, caption.utteranceId, config.fontSizePx, config.maxLines, config.maxWidthPercent, measureRevision]);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const observer = new ResizeObserver(() => setMeasureRevision((current) => current + 1));
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (config.readingMode !== 'pages' || pageIndex >= pages.length - 1) return;
    const queuedPages = pages.length - pageIndex - 1;
    const normalDuration = readingDurationMs(pages[pageIndex] ?? '');
    const targetDuration = queuedPages > 1 ? CAPTION_CATCHUP_MIN_MS : normalDuration;
    const remaining = Math.max(0, targetDuration - (Date.now() - pageStartedAt.current));
    const timer = window.setTimeout(() => {
      pageStartedAt.current = Date.now();
      setPageIndex((current) => Math.min(current + 1, pages.length - 1));
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [config.readingMode, pageIndex, pages]);

  const effectivePageIndex = config.readingMode === 'rollup' ? pages.length - 1 : pageIndex;
  const text = pages[Math.max(0, effectivePageIndex)] ?? '';
  const label = caption.source === 'host'
    ? caption.label ?? profile?.hostLabel ?? 'Hôte'
    : caption.source === 'guest'
      ? caption.label ?? profile?.guestLabel ?? 'Invités'
      : '';
  const accent = caption.source === 'host' ? config.hostAccentColor : config.guestAccentColor;
  const cardStyle = { '--caption-accent': accent } as CSSProperties;

  return (
    <div
      className={`caption-card source-${caption.source} ${placeholder ? 'is-placeholder' : ''} ${caption.visible ? '' : 'is-leaving'}`}
      data-source={caption.source}
      style={cardStyle}
    >
      {config.showLabels && label && <span className="caption-label">{label}</span>}
      <span ref={shellRef} className="caption-text-shell">
        <span
          className={`caption-text ${config.readingMode === 'rollup' ? 'is-rollup' : 'is-page'}`}
          key={`${caption.utteranceId}-${effectivePageIndex}`}
        >
          {text}
        </span>
        <span ref={measureRef} className="caption-measure" aria-hidden="true" />
      </span>
    </div>
  );
}

function placeholderCaption(text: string): CaptionState {
  return {
    source: 'mixed',
    utteranceId: 'placeholder',
    revision: 1,
    isFinal: true,
    text,
    sequence: 0,
    receivedAt: Date.now(),
    expiresAt: Number.MAX_SAFE_INTEGER,
    visible: true,
  };
}

export function effectiveOverlayConfig(config: OverlayConfig): OverlayConfig {
  return { ...config };
}

export const OVERLAY_CANVAS = { width: CANVAS_WIDTH, height: CANVAS_HEIGHT } as const;
