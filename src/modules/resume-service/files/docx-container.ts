import { inflateRawSync } from 'node:zlib';
import { AppError } from '../../../shared/http/errors.ts';

export function zipCrc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Bounded ZIP validation; no extraction to disk, ZIP64, encryption or macros. */
export function validateDocxContainer(content: Buffer): void {
  const reject = (): never => { throw new AppError(422, 'RESUME_FILE_UNSAFE', 'DOCX container failed validation.'); };
  try {
    let end = -1;
    for (let i = content.length - 22; i >= Math.max(0, content.length - 65557); i--) {
      if (content.readUInt32LE(i) === 0x06054b50 && i + 22 + content.readUInt16LE(i + 20) === content.length) { end = i; break; }
    }
    if (end < 0) return reject();
    const count = content.readUInt16LE(end + 10);
    const size = content.readUInt32LE(end + 12);
    const start = content.readUInt32LE(end + 16);
    if (content.readUInt32LE(end + 4) !== 0 || content.readUInt16LE(end + 8) !== count || count < 3 || count > 256 || start + size !== end) return reject();
    let cursor = start, expanded = 0;
    const names = new Set<string>();
    const ranges: Array<[number, number]> = [];
    const required = new Map<string, string>();
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > end || content.readUInt32LE(cursor) !== 0x02014b50) return reject();
      const flags = content.readUInt16LE(cursor + 8), method = content.readUInt16LE(cursor + 10);
      const crc = content.readUInt32LE(cursor + 16), packed = content.readUInt32LE(cursor + 20), unpacked = content.readUInt32LE(cursor + 24);
      const length = content.readUInt16LE(cursor + 28), extra = content.readUInt16LE(cursor + 30), comment = content.readUInt16LE(cursor + 32);
      const local = content.readUInt32LE(cursor + 42);
      if (cursor + 46 + length + extra + comment > end || content.readUInt16LE(cursor + 34) !== 0 || (flags & ~0x080e) !== 0 || ![0, 8].includes(method)) return reject();
      const name = content.subarray(cursor + 46, cursor + 46 + length).toString('utf8');
      const folded = name.toLowerCase();
      if (!name || names.has(folded) || name.includes('\\') || name.startsWith('/') || name.includes(':') || name.split('/').some(p => p === '..' || p === '.') || /[\x00-\x1f]/.test(name)) return reject();
      if (/vbaproject|word\/(embeddings|activex)\//i.test(name)) return reject();
      names.add(folded);
      expanded += unpacked;
      if (unpacked > 20 * 1024 * 1024 || expanded > 30 * 1024 * 1024 || unpacked > Math.max(packed * 100, 1024 * 1024)) return reject();
      if (local + 30 > start || content.readUInt32LE(local) !== 0x04034b50 || content.readUInt16LE(local + 6) !== flags || content.readUInt16LE(local + 8) !== method) return reject();
      const localLength = content.readUInt16LE(local + 26), localExtra = content.readUInt16LE(local + 28);
      if (!(flags & 8) && (content.readUInt32LE(local + 14) !== crc || content.readUInt32LE(local + 18) !== packed || content.readUInt32LE(local + 22) !== unpacked)) return reject();
      const dataStart = local + 30 + localLength + localExtra, dataEnd = dataStart + packed;
      if (dataEnd > start || dataStart > start || localLength !== length || !content.subarray(local + 30, local + 30 + localLength).equals(content.subarray(cursor + 46, cursor + 46 + length))) return reject();
      if (ranges.some(([a, b]) => local < b && dataEnd > a)) return reject();
      ranges.push([local, dataEnd]);
      const data = content.subarray(dataStart, dataEnd);
      const plain = method === 0 ? data : inflateRawSync(data, { maxOutputLength: Math.max(1, unpacked) });
      if (plain.length !== unpacked || zipCrc32(plain) !== crc) return reject();
      if (name.endsWith('.xml') || name.endsWith('.rels')) {
        const xml = plain.toString('utf8');
        if (/<!DOCTYPE|<!ENTITY|macroEnabled|vbaProject|EICAR-STANDARD-ANTIVIRUS-TEST-FILE/i.test(xml)) return reject();
        if (['[Content_Types].xml', '_rels/.rels', 'word/document.xml'].includes(name)) required.set(name, xml);
      }
      cursor += 46 + length + extra + comment;
    }
    if (cursor !== end || required.size !== 3 || !required.get('[Content_Types].xml')?.includes('wordprocessingml.document.main+xml') || !required.get('_rels/.rels')?.includes('officeDocument') || !required.get('word/document.xml')?.includes('wordprocessingml/2006/main')) return reject();
  } catch (error) {
    if (error instanceof AppError) throw error;
    reject();
  }
}
