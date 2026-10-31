/**
 * Beschriftung nach DIN ISO 1219-1 (5.12, 5.13) und ISO 3098.
 *
 * ISO 3098 misst die Schriftgröße h als Höhe der Großbuchstaben. SVG und PDF
 * messen die Schriftgröße dagegen als Geviert (em), das bei Arial/Helvetica
 * etwa 1,4-mal so groß ist wie die Versalhöhe. Alle Texte auf dem Blatt
 * rechnen deshalb von h auf die Schriftgröße um.
 *
 * DIN ISO 1219-1, 5.12: Beschriftung im Schaltplan 2,5 mm hoch mit 0,25 mm
 * Linienbreite, unabhängig vom Modul. 5.13: Maße nach ISO 3098-5, Schriftform CB.
 */

/** Versalhöhe von Arial, Helvetica und Liberation Sans im Verhältnis zum Geviert. */
export const CAP_HEIGHT_EM = 0.716;

/** Nennhöhen h nach ISO 3098 in Einheiten (1 Einheit = 0,25 mm). */
export const LETTERING = {
  /** 1,8 mm, nur für Feldbezeichnungen im Schriftfeld. */
  small: 7.2,
  /** 2,5 mm, Regelhöhe im Schaltplan (DIN ISO 1219-1, 5.12). */
  normal: 10,
  /** 3,5 mm, Titel im Schriftfeld. */
  large: 14,
} as const;

/** Schriftgröße (Geviert) für eine Versalhöhe h, beide in Einheiten. */
export const fontSizeFor = (h: number) => Math.round((h / CAP_HEIGHT_EM) * 100) / 100;

/** Geschätzte Breite eines Textes in Arial (Einheiten), z. B. für den Kasten um ein Kennzeichen. */
export function textWidth(text: string, h: number): number {
  const em = fontSizeFor(h);
  let w = 0;
  for (const ch of text) {
    if (/[0-9]/.test(ch)) w += 0.556;
    else if (ch === '.' || ch === ',' || ch === ' ') w += 0.278;
    else if (ch === '-') w += 0.333;
    else if (/[a-z]/.test(ch)) w += 0.5;
    else w += 0.667;
  }
  return w * em;
}
