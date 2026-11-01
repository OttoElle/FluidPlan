/**
 * Hilfen zum Einlesen von Bauteil-Konfigurationen aus Dateien. Jede Funktion
 * meldet Abweichungen in `errors` (mit Pfad) und gibt den Wert unverändert
 * zurück; der Aufrufer prüft am Ende, ob Fehler hinzugekommen sind.
 */

export type Obj = Record<string, unknown>;

export const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const keysOf = <T extends string>(r: Record<T, string>) => Object.keys(r) as T[];

export class ConfigReader {
  private readonly before: number;

  constructor(
    readonly v: Obj,
    private readonly path: string,
    private readonly errors: string[],
  ) {
    this.before = errors.length;
  }

  /** Wert aus einer Namensliste; fehlt er und gibt es einen Standard, gilt dieser (für ältere Dateien). */
  oneOf<T extends string>(key: string, names: Record<T, string>, fallback?: T): T {
    const value = this.v[key];
    if (value === undefined && fallback !== undefined) return fallback;
    if (!keysOf(names).includes(value as T)) {
      this.errors.push(`${this.path}.${key}: einer von ${keysOf(names).map((k) => JSON.stringify(k)).join(', ')} erwartet`);
    }
    return value as T;
  }

  /** Zahl aus einer festen Auswahl, z. B. Anzahl der Wege. */
  count<T extends number>(key: string, allowed: readonly T[], fallback?: T): T {
    const value = this.v[key];
    if (value === undefined && fallback !== undefined) return fallback;
    if (!allowed.includes(value as T)) this.errors.push(`${this.path}.${key}: einer von ${allowed.join(', ')} erwartet`);
    return value as T;
  }

  /** Zahl im Bereich [min, max]. */
  number(key: string, min: number, max: number, fallback?: number): number {
    const value = this.v[key];
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      this.errors.push(`${this.path}.${key}: Zahl von ${min} bis ${max} erwartet`);
    }
    return value as number;
  }

  /** Freier Text, z. B. eine Bezeichnung. */
  text(key: string, fallback?: string): string {
    const value = this.v[key];
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'string') this.errors.push(`${this.path}.${key}: Text erwartet`);
    return value as string;
  }

  bool(key: string, fallback?: boolean): boolean {
    const value = this.v[key];
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== 'boolean') this.errors.push(`${this.path}.${key}: true oder false erwartet`);
    return value as boolean;
  }

  get ok(): boolean {
    return this.errors.length === this.before;
  }
}

/** Startet das Einlesen; gibt undefined zurück (mit Fehlermeldung), wenn kein Objekt vorliegt. */
export function configReader(v: unknown, path: string, errors: string[]): ConfigReader | undefined {
  if (!isObject(v)) {
    errors.push(`${path}: Objekt erwartet`);
    return undefined;
  }
  return new ConfigReader(v, path, errors);
}
