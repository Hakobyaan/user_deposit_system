import { Transform, TransformCallback } from 'node:stream';

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * Converts a stream of row objects into CSV text, one line per row, with a
 * header row emitted from the first chunk's keys. Left as a plain Transform
 * (no internal buffering beyond one row) so that piping it downstream of a
 * pg-query-stream and into an HTTP response lets Node's stream machinery
 * apply backpressure end-to-end: if the client reads slowly, res.write()
 * returns false, the pipe pauses this Transform, which pauses the upstream
 * query stream, which stops fetching more rows from Postgres — no unbounded
 * buffering anywhere in the chain.
 */
export class CsvTransform extends Transform {
  private headerWritten = false;

  constructor() {
    super({
      objectMode: true
    });
  }

  public _transform(row: Record<string, unknown>, _enc: BufferEncoding, callback: TransformCallback): void {
    let chunk = '';
    if (!this.headerWritten) {
      chunk += `${Object.keys(row).join(',')}\n`;
      this.headerWritten = true;
    }
    chunk += `${Object.values(row).map(escapeCsvValue).join(',')}\n`;
    callback(null, chunk);
  }
}
