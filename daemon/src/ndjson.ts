/**
 * Incremental NDJSON parser, safe under arbitrary chunk boundaries (POC risk
 * #4: "streaming JSON parsing under partial chunks — fuzz the parser").
 *
 * Feed it raw stdout chunks; it yields one result per complete line. A line
 * that fails to parse is surfaced as { ok: false } rather than thrown — a
 * malformed line from the CLI must never kill the run.
 */
export type NdjsonResult =
  | { ok: true; value: unknown }
  | { ok: false; line: string; error: string };

export class NdjsonParser {
  private buffer = '';

  /** Push a chunk; returns results for every line completed by this chunk. */
  push(chunk: string): NdjsonResult[] {
    this.buffer += chunk;
    const results: NdjsonResult[] = [];
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, nl).replace(/\r$/, '');
      this.buffer = this.buffer.slice(nl + 1);
      if (line.trim() === '') continue;
      results.push(this.parseLine(line));
    }
    return results;
  }

  /** Call at stream end: flushes a final unterminated line if present. */
  flush(): NdjsonResult[] {
    const line = this.buffer.replace(/\r$/, '');
    this.buffer = '';
    if (line.trim() === '') return [];
    return [this.parseLine(line)];
  }

  private parseLine(line: string): NdjsonResult {
    try {
      return { ok: true, value: JSON.parse(line) };
    } catch (e) {
      return { ok: false, line, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
