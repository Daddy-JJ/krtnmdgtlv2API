import test from'node:test';import assert from'node:assert/strict';
import{validateResumeFile}from'../../src/modules/resume-service/files/resume-file-validator.ts';
test('resume validator accepts signed PDF and rejects fake extension',()=>{const pdf=Buffer.from('%PDF-1.7\nsafe');assert.equal(validateResumeFile('SOURCE_RESUME','cv.pdf',pdf).mime,'application/pdf');assert.throws(()=>validateResumeFile('SOURCE_RESUME','cv.pdf',Buffer.from('not pdf')),{code:'RESUME_FILE_MIME_MISMATCH'});});
test('resume validator accepts DOCX container marker and rejects macros',()=>{const docx=Buffer.concat([Buffer.from([0x50,0x4b,0x03,0x04,0,0,0,0]),Buffer.from('word/document.xml')]);assert.equal(validateResumeFile('DELIVERABLE','result.docx',docx).extension,'docx');assert.throws(()=>validateResumeFile('DELIVERABLE','result.docx',Buffer.concat([docx,Buffer.from('word/vbaProject.bin')])),{code:'RESUME_FILE_UNSAFE'});});
test('resume validator rejects executable and EICAR payload',()=>{assert.throws(()=>validateResumeFile('SOURCE_RESUME','cv.exe',Buffer.from('MZ')),{code:'RESUME_FILE_TYPE_NOT_ALLOWED'});assert.throws(()=>validateResumeFile('SOURCE_RESUME','cv.pdf',Buffer.from('%PDF-EICAR-STANDARD-ANTIVIRUS-TEST-FILE')),{code:'RESUME_FILE_UNSAFE'});});
test('source DOCX accepts up to 10 MiB and rejects larger files',()=>{
  const valid=Buffer.alloc(6*1024*1024);valid[0]=0x50;valid[1]=0x4b;valid.write('word/document.xml',128);
  assert.equal(validateResumeFile('SOURCE_RESUME','cv.docx',valid).size,valid.length);
  const tooLarge=Buffer.alloc(10*1024*1024+1);tooLarge[0]=0x50;tooLarge[1]=0x4b;tooLarge.write('word/document.xml',128);
  assert.throws(()=>validateResumeFile('SOURCE_RESUME','cv.docx',tooLarge),{code:'RESUME_FILE_TOO_LARGE'});
});
