import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResumeFile } from '../../src/modules/resume-service/files/resume-file-validator.ts';
import { zipCrc32 } from '../../src/modules/resume-service/files/docx-container.ts';
import { docx } from '../helpers/docx.ts';

test('file signatures never assert antivirus cleanliness', () => {
  assert.equal(validateResumeFile('SOURCE_RESUME', 'cv.pdf', Buffer.from('%PDF-1.7')).scanStatus, 'PENDING_SCAN');
  assert.throws(() => validateResumeFile('SOURCE_RESUME', 'cv.pdf', Buffer.from('not pdf')), { code: 'RESUME_FILE_MIME_MISMATCH' });
});
test('DOCX validates ZIP structure, decompressed parts and CRC', () => {
  assert.equal(zipCrc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(validateResumeFile('DELIVERABLE', 'result.docx', docx()).extension, 'docx');
  const damaged = docx(); damaged[31] = 255;
  for (const content of [Buffer.from('PK word/document.xml'), damaged, docx().subarray(0, 100)]) {
    assert.throws(() => validateResumeFile('SOURCE_RESUME', 'cv.docx', content), { code: 'RESUME_FILE_UNSAFE' });
  }
});
test('DOCX rejects macros, traversal, expansion bombs and XML entities', () => {
  const entries: Array<Record<string, string>> = [
    { 'word/vbaProject.bin': 'macro' }, { '../payload': 'unsafe' },
    { 'word/document.xml': '<!DOCTYPE test [<!ENTITY x SYSTEM "file:///etc/passwd">]>' },
    { 'word/bomb.xml': 'a'.repeat(2 * 1024 * 1024) },
  ];
  for (const entry of entries) assert.throws(() => validateResumeFile('SOURCE_RESUME', 'cv.docx', docx(entry)), { code: 'RESUME_FILE_UNSAFE' });
});
test('resume validator rejects executable and EICAR payload', () => {
  assert.throws(() => validateResumeFile('SOURCE_RESUME', 'cv.exe', Buffer.from('MZ')), { code: 'RESUME_FILE_TYPE_NOT_ALLOWED' });
  assert.throws(() => validateResumeFile('SOURCE_RESUME', 'cv.pdf', Buffer.from('%PDF-EICAR-STANDARD-ANTIVIRUS-TEST-FILE')), { code: 'RESUME_FILE_UNSAFE' });
});
test('source file size is bounded at 10 MiB', () => {
  const bytes = Buffer.alloc(6 * 1024 * 1024); bytes.write('%PDF-1.7');
  assert.equal(validateResumeFile('SOURCE_RESUME', 'cv.pdf', bytes).size, bytes.length);
  assert.throws(() => validateResumeFile('SOURCE_RESUME', 'cv.pdf', Buffer.alloc(10 * 1024 * 1024 + 1)), { code: 'RESUME_FILE_TOO_LARGE' });
});
