import { useEffect, useState } from 'react';

const DELAY_MS = 350;
const GAP = 6;
const MARGIN = 4;

interface Tip {
  text: string;
  x: number;
  y: number;
  place: 'below' | 'above' | 'left';
}

/**
 * Ein gemeinsamer Tooltip für alle Elemente mit `data-tooltip`. Er liegt fest
 * über allem, damit ihn scrollende Seitenleisten nicht abschneiden, und wird
 * am Fensterrand eingerückt.
 */
export function Tooltip() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [el, setEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const hide = () => {
      window.clearTimeout(timer);
      setTip(null);
    };
    const show = (target: EventTarget | null, delay: number) => {
      const anchor = target instanceof Element ? target.closest<HTMLElement>('[data-tooltip]') : null;
      window.clearTimeout(timer);
      if (!anchor || (anchor as HTMLButtonElement).disabled) return setTip(null);
      timer = window.setTimeout(() => {
        const r = anchor.getBoundingClientRect();
        const place = (anchor.dataset.tooltipPos as Tip['place'] | undefined) ?? 'below';
        const x = place === 'left' ? r.left - GAP : r.left + r.width / 2;
        const y = place === 'below' ? r.bottom + GAP : place === 'above' ? r.top - GAP : r.top + r.height / 2;
        setTip({ text: anchor.dataset.tooltip!, x, y, place });
      }, delay);
    };
    const over = (e: PointerEvent) => show(e.target, DELAY_MS);
    const focus = (e: FocusEvent) => (e.target as Element).matches?.(':focus-visible') && show(e.target, 0);
    window.addEventListener('pointerover', over);
    window.addEventListener('focusin', focus);
    window.addEventListener('focusout', hide);
    window.addEventListener('pointerdown', hide);
    window.addEventListener('wheel', hide, { passive: true });
    return () => {
      hide();
      window.removeEventListener('pointerover', over);
      window.removeEventListener('focusin', focus);
      window.removeEventListener('focusout', hide);
      window.removeEventListener('pointerdown', hide);
      window.removeEventListener('wheel', hide);
    };
  }, []);

  // Nach dem Rendern in das Fenster einrücken.
  useEffect(() => {
    if (!el || !tip) return;
    const r = el.getBoundingClientRect();
    const dx = Math.min(0, window.innerWidth - MARGIN - r.right) + Math.max(0, MARGIN - r.left);
    if (dx) el.style.translate = `${dx}px 0`;
  }, [el, tip]);

  if (!tip) return null;
  return (
    <div
      ref={setEl}
      role="tooltip"
      className={`tooltip ${tip.place}`}
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.text}
    </div>
  );
}
