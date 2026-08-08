import test from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{resolve}from'node:path';

const root=resolve(import.meta.dirname,'../..');

test('Phase 9 migration contains normalized RBAC, workflow, retention, and immutable audit tables',async()=>{
  const sql=await readFile(resolve(root,'database/migrations/004_phase9_rbac_resume_service.sql'),'utf8');
  for(const table of['roles','permissions','role_permissions','user_roles','admin_interventions','subscription_periods','resume_service_entitlements','resume_requests','resume_request_files','resume_request_messages','resume_request_sla_events','resume_deliverables','resume_quality_reviews','resume_download_logs','resume_retention_notices'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  assert.match(sql,/UNIQUE KEY uq_resume_entitlement_request/);
  assert.match(sql,/UNIQUE KEY uq_resume_revision/);
});

test('Resume routes cover owner, assigned specialist, quality release, and private downloads',async()=>{
  const routes=await readFile(resolve(root,'src/modules/resume-service/routes/resume-router.ts'),'utf8');
  for(const path of['/eligibility','/:publicId/files','/:publicId/files/:filePublicId/download','/:publicId/revision','/:publicId/assign','/:publicId/request-information','/:publicId/mark-data-complete','/:publicId/start','/:publicId/deliverables','/:publicId/complete'])assert.match(routes,new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('Operational queue and detail are assignment scoped and omit storage paths',async()=>{
  const repository=await readFile(resolve(root,'src/modules/resume-service/repositories/mysql-resume-repository.ts'),'utf8');
  assert.match(repository,/WHERE \(\?=1 OR s\.public_id=\?\)/);
  const operational=repository.slice(repository.indexOf('async operationalDetail'));
  assert.doesNotMatch(operational,/storage_path/);
  for(const field of['whatsappNumber','linkedinUrl','pastedResumeText','pastedJobDescription','additionalAchievements','certifications','userNotes'])assert.match(operational,new RegExp(field));
});

test('Specialist file access requires both current assignment and active RBAC permission',async()=>{
  const service=await readFile(resolve(root,'src/modules/resume-service/files/resume-file-service.ts'),'utf8');
  assert.match(service,/assigned_public_id===actor[\s\S]*permissions\.has\('resume\.work'\)/);
  assert.match(service,/assigned_public_id!==actor\|\|!permissions\.has\('resume\.assigned\.read'\)/);
});
