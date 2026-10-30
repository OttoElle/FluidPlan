import { STROKE_DASH, TEXT_SIZES } from '../../model/annotations.ts';
import type { LineKind, StrokeStyle } from '../../model/types.ts';
import { LINE_DASH } from '../canvas/lineStyle.ts';
import { StrokeIcon, type SegmentOption } from './Segmented.tsx';

/** Leitungsarten nach ISO 1219-1 mit Strichmuster als Symbol. */
export const LINE_KIND_OPTIONS: SegmentOption<LineKind>[] = [
  { value: 'working', label: 'Arbeitsleitung', icon: <StrokeIcon dash={LINE_DASH.working} /> },
  { value: 'pilot', label: 'Steuerleitung', icon: <StrokeIcon dash={LINE_DASH.pilot} /> },
  { value: 'drain', label: 'Leckageleitung', icon: <StrokeIcon dash={LINE_DASH.drain} /> },
];

// Grafik-Strichmuster sind in Blatteinheiten angegeben; fürs Symbol halbiert.
const half = (dash: string | undefined) => dash?.split(' ').map((v) => Number(v) / 2).join(' ');

export const STROKE_STYLE_OPTIONS: SegmentOption<StrokeStyle>[] = [
  { value: 'solid', label: 'Volllinie', icon: <StrokeIcon dash={half(STROKE_DASH.solid)} /> },
  { value: 'dashed', label: 'Strichlinie', icon: <StrokeIcon dash={half(STROKE_DASH.dashed)} /> },
  { value: 'dashdot', label: 'Strich-Punkt (Baugruppe)', icon: <StrokeIcon dash={half(STROKE_DASH.dashdot)} /> },
];

export const TEXT_SIZE_OPTIONS: SegmentOption<number>[] = TEXT_SIZES.map((t) => ({
  value: t.size,
  label: `Schrifthöhe ${t.name}`,
  icon: <span style={{ fontSize: 8 + t.size / 3 }}>A</span>,
}));
