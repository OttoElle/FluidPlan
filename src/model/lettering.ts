/**
 * Beschriftung nach DIN ISO 1219-1 (5.12, 5.13) und ISO 3098.
 *
 * Schrift ist osifont (ISO 3098, freie Lizenz, siehe ui/fonts/README.md),
 * ersatzweise Arial. ISO 3098 misst die Schriftgröße h als Höhe der
 * Großbuchstaben; SVG und PDF messen sie als Geviert (em), das bei osifont
 * etwa 1,36-mal so groß ist wie die Versalhöhe. Alle Texte auf dem Blatt
 * rechnen deshalb von h auf die Schriftgröße um.
 *
 * DIN ISO 1219-1, 5.12: Beschriftung im Schaltplan 2,5 mm hoch mit 0,25 mm
 * Linienbreite, unabhängig vom Modul. 5.13: Maße nach ISO 3098-5, Schriftform CB.
 */

/** Schriftfamilie für alle Texte auf dem Blatt und im Export. */
export const DRAWING_FONT = 'osifont, Arial, Helvetica, sans-serif';

/** Versalhöhe von osifont im Verhältnis zum Geviert (1510 / 2048; Arial: 0,716). */
export const CAP_HEIGHT_EM = 0.737;

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

/** Geschätzte Breite eines Textes in osifont (Einheiten), z. B. für den Kasten um ein Kennzeichen. */
export function textWidth(text: string, h: number): number {
  const em = fontSizeFor(h);
  let w = 0;
  for (const ch of text) {
    if (/[0-9]/.test(ch)) w += 0.468;
    else if (ch === '.' || ch === ',') w += 0.201;
    else if (ch === ' ') w += 0.25;
    else if (ch === '-') w += 0.465;
    else if (/[a-zäöüß]/.test(ch)) w += 0.46;
    else w += 0.56;
  }
  return w * em;
}
