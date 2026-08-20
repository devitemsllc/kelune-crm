import React, { useCallback, useEffect, useRef, useState } from 'react';
import { withPreviewStyle } from '@/utils/emailFooter';

interface EmailPreviewFrameProps {
  /**
   * The email body to render, footer already resolved. Callers own that step:
   * a composed preview needs the global footer spliced in, a sent message has
   * its own baked in and must not gain a second.
   */
  html: string;
  title: string;
  /** Tallest the frame may grow; content beyond this scrolls inside it. */
  maxHeight: number;
  /** Shortest the frame may shrink, so a one-line email still reads as a panel. */
  minHeight?: number;
  sandbox?: string;
}

/**
 * An email rendered in an iframe sized to its own content, clamped to
 * [minHeight, maxHeight].
 *
 * A fixed frame leaves a short email stranded above a block of dead space. The
 * frame follows the document instead, which keeps the email top-anchored — the
 * way every mail client renders it — with no filler below.
 */
const EmailPreviewFrame = ({
  html,
  title,
  maxHeight,
  minHeight = 120,
  sandbox,
}: EmailPreviewFrameProps) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [height, setHeight] = useState(minHeight);

  const measure = useCallback(() => {
    const root = frameRef.current?.contentDocument?.documentElement;
    if (!root) {
      return;
    }
    // The root element, not body: a full email document carries its background
    // and padding on the root, which body alone under-reports.
    setHeight(Math.min(maxHeight, Math.max(minHeight, root.scrollHeight)));
  }, [maxHeight, minHeight]);

  // Each srcDoc swap replaces the document, so the observer is (re)bound on load
  // rather than in an effect. Images and fonts land after load and each changes
  // the height, hence watching instead of measuring once.
  const handleLoad = () => {
    measure();
    const root = frameRef.current?.contentDocument?.documentElement;
    observerRef.current?.disconnect();
    if (root && typeof ResizeObserver !== 'undefined') {
      observerRef.current = new ResizeObserver(measure);
      observerRef.current.observe(root);
    }
  };

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return (
    <iframe
      ref={frameRef}
      srcDoc={withPreviewStyle(html)}
      onLoad={handleLoad}
      sandbox={sandbox}
      title={title}
      style={{ width: '100%', height, border: 'none', display: 'block' }}
    />
  );
};

export default EmailPreviewFrame;
