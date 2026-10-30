import type { LineKind } from '../../model/types.ts';

/** Strichmuster der Leitungsarten nach ISO 1219-1. */
export const LINE_DASH: Record<LineKind, string | undefined> = { working: undefined, pilot: '6 4', drain: '2 3' };
