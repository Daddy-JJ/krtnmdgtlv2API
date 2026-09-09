START TRANSACTION;

SET @dummy_user_public_id='00000000-0000-4000-8000-000000000101';
SET @dummy_admin_public_id='00000000-0000-4000-8000-000000000121';
SET @dummy_card_public_id='00000000-0000-4000-8000-000000000102';
SET @dummy_subscription_public_id='00000000-0000-4000-8000-000000000103';
SET @dummy_payment_public_id='00000000-0000-4000-8000-000000000104';
SET @dummy_entitlement_public_id='00000000-0000-4000-8000-000000000105';
SET @dummy_request_public_id='00000000-0000-4000-8000-000000000106';
SET @dummy_file_public_id='00000000-0000-4000-8000-000000000107';
SET @dummy_revision_public_id='00000000-0000-4000-8000-000000000108';
SET @dummy_deliverable_public_id='00000000-0000-4000-8000-000000000109';

INSERT INTO users(public_id,email,password_hash,role,status,email_verified_at,created_at,updated_at)
VALUES(@dummy_user_public_id,'dummy.member@example.test','disabled-dummy-password-hash','member','active',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at);
INSERT INTO users(public_id,email,password_hash,role,status,email_verified_at,created_at,updated_at)
VALUES(@dummy_admin_public_id,'dummy.resume-admin@example.test','disabled-dummy-password-hash','resume_service_admin','active',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at);
SET @dummy_user_id=(SELECT id FROM users WHERE BINARY public_id=BINARY @dummy_user_public_id);
SET @dummy_admin_id=(SELECT id FROM users WHERE BINARY public_id=BINARY @dummy_admin_public_id);
SET @member_role_id=(SELECT id FROM roles WHERE code='member');
SET @service_admin_role_id=(SELECT id FROM roles WHERE code='resume_service_admin');
SET @pro_plan_id=(SELECT id FROM plans WHERE code='pro');
SET @starter_theme_id=(SELECT id FROM themes WHERE code='starter-clean');

INSERT INTO user_roles(user_id,role_id,granted_at)
VALUES(@dummy_user_id,@member_role_id,UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE revoked_at=NULL;
INSERT INTO user_roles(user_id,role_id,granted_at)
VALUES(@dummy_admin_id,@service_admin_role_id,UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE revoked_at=NULL;

INSERT INTO cards(public_id,user_id,slug,slug_kind,plan_code,theme_id,locale,status,published_at,created_at,updated_at)
VALUES(@dummy_card_public_id,@dummy_user_id,'DummyQaCard','custom','pro',@starter_theme_id,'id','published',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at);
SET @dummy_card_id=(SELECT id FROM cards WHERE BINARY public_id=BINARY @dummy_card_public_id);

INSERT INTO card_contacts(card_id,full_name,job_title,organization,office_phone,mobile_phone,email,website_url,address_text,maps_url,created_at,updated_at)
VALUES(@dummy_card_id,'Dummy QA Member','QA Engineer','KartuNamaDigital','021000000','081200000000','dummy.member@example.test','https://example.test','Jakarta','https://maps.example.test',UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at);

INSERT INTO card_social_links(card_id,platform,url,sort_order,created_at,updated_at)
SELECT @dummy_card_id,'linkedin','https://example.test/linkedin',1,UTC_TIMESTAMP(),UTC_TIMESTAMP()
WHERE NOT EXISTS(SELECT 1 FROM card_social_links WHERE card_id=@dummy_card_id AND platform='linkedin');

INSERT INTO catalog_items(public_id,card_id,title,description,target_url,sort_order,is_published,created_at,updated_at)
VALUES('00000000-0000-4000-8000-000000000110',@dummy_card_id,'Dummy service','Development-only catalog record','https://example.test/catalog',1,1,UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at);

INSERT INTO starter_manage_tokens(card_id,token_hash,created_at)
VALUES(@dummy_card_id,SHA2('dummy-starter-token',256),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE card_id=VALUES(card_id);

INSERT INTO refresh_tokens(user_id,token_hash,family_id,expires_at,revoked_at,created_at)
VALUES(@dummy_user_id,SHA2('dummy-refresh-token',256),'00000000-0000-4000-8000-000000000111',DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY),UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE revoked_at=VALUES(revoked_at);

INSERT INTO password_reset_tokens(user_id,token_hash,expires_at,used_at,created_at)
VALUES(@dummy_user_id,SHA2('dummy-reset-token',256),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR),UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE used_at=VALUES(used_at);

INSERT INTO email_otps(public_id,user_id,destination_email,purpose,code_hash,attempts,max_attempts,expires_at,last_sent_at,consumed_at,created_at)
VALUES('00000000-0000-4000-8000-000000000112',@dummy_user_id,'dummy.member@example.test','development',SHA2('000000',256),0,5,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE),UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE consumed_at=VALUES(consumed_at);

INSERT INTO subscriptions(public_id,user_id,plan_id,status,starts_at,ends_at,created_at,updated_at)
VALUES(@dummy_subscription_public_id,@dummy_user_id,@pro_plan_id,'active',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 365 DAY),UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at);
SET @dummy_subscription_id=(SELECT id FROM subscriptions WHERE BINARY public_id=BINARY @dummy_subscription_public_id);

INSERT INTO payments(public_id,subscription_id,user_id,gateway,merchant_order_id,gateway_transaction_id,target_plan_code,plan_name_snapshot,duration_days_snapshot,gateway_status,fraud_status,snap_redirect_url,amount,currency,status,paid_at,expires_at,created_at,updated_at)
VALUES(@dummy_payment_public_id,@dummy_subscription_id,@dummy_user_id,'dummy','DUMMY-QA-ORDER-001','DUMMY-QA-TRANSACTION-001','pro','Pro',365,'settlement','accept','https://example.test/payment',1,'IDR','paid',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY),UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at);
SET @dummy_payment_id=(SELECT id FROM payments WHERE BINARY public_id=BINARY @dummy_payment_public_id);

INSERT INTO payment_events(payment_id,gateway_event_key,payload_hash,event_type,received_at,processed_at,processing_status)
VALUES(@dummy_payment_id,'DUMMY-QA-EVENT-001',SHA2('{}',256),'dummy.settlement',UTC_TIMESTAMP(),UTC_TIMESTAMP(),'processed')
ON DUPLICATE KEY UPDATE processed_at=VALUES(processed_at);

INSERT INTO subscription_periods(public_id,subscription_id,source_payment_id,period_start,period_end,created_at)
VALUES('00000000-0000-4000-8000-000000000113',@dummy_subscription_id,@dummy_payment_id,'2026-01-01 00:00:00','2027-01-01 00:00:00',UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE source_payment_id=VALUES(source_payment_id);
SET @dummy_period_id=(SELECT id FROM subscription_periods WHERE public_id='00000000-0000-4000-8000-000000000113');

INSERT INTO resume_service_entitlements(public_id,user_id,subscription_period_id,beneficiary_name,beneficiary_name_normalized,consumed_at,created_at,updated_at)
VALUES(@dummy_entitlement_public_id,@dummy_user_id,@dummy_period_id,'Dummy QA Member','dummy qa member',UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at);
SET @dummy_entitlement_id=(SELECT id FROM resume_service_entitlements WHERE BINARY public_id=BINARY @dummy_entitlement_public_id);

INSERT INTO resume_requests(public_id,entitlement_id,user_id,beneficiary_name_snapshot,account_email_snapshot,whatsapp_number,current_job_title,current_organization,experience_years,career_level,target_role,target_industry,target_company,target_country,resume_language,resume_style,status,priority,assigned_specialist_id,revision_count,max_revisions,submitted_at,data_complete_at,sla_due_at,created_at,updated_at)
VALUES(@dummy_request_public_id,@dummy_entitlement_id,@dummy_user_id,'Dummy QA Member','dummy.member@example.test','081200000000','QA Engineer','KartuNamaDigital',5.0,'MID','Senior QA','Technology','Example','Indonesia','id','professional','READY_FOR_REVIEW','NORMAL',@dummy_admin_id,1,3,UTC_TIMESTAMP(),UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 DAY),UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at);
SET @dummy_request_id=(SELECT id FROM resume_requests WHERE BINARY public_id=BINARY @dummy_request_public_id);

INSERT INTO resume_request_files(public_id,resume_request_id,uploaded_by_user_id,file_role,original_filename,stored_filename,storage_disk,storage_path,extension,detected_mime,size_bytes,sha256,scan_status,created_at)
VALUES(@dummy_file_public_id,@dummy_request_id,@dummy_user_id,'DELIVERABLE','dummy.docx','dummy.docx','private','dummy/dummy.docx','docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',1,SHA2('dummy-file',256),'PENDING',UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE scan_status=VALUES(scan_status);
SET @dummy_file_id=(SELECT id FROM resume_request_files WHERE BINARY public_id=BINARY @dummy_file_public_id);

INSERT INTO resume_request_assignments(request_id,specialist_user_id,assigned_by_user_id,assigned_at,reason)
SELECT @dummy_request_id,@dummy_admin_id,@dummy_admin_id,UTC_TIMESTAMP(),'Development dummy assignment'
WHERE NOT EXISTS(SELECT 1 FROM resume_request_assignments WHERE request_id=@dummy_request_id);

INSERT INTO resume_request_messages(public_id,request_id,sender_user_id,visibility,message,created_at)
VALUES('00000000-0000-4000-8000-000000000114',@dummy_request_id,@dummy_admin_id,'INTERNAL','Development dummy message',UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE message=VALUES(message);

INSERT INTO resume_request_status_logs(request_id,from_status,to_status,changed_by_user_id,reason,created_at)
SELECT @dummy_request_id,'IN_PROGRESS','READY_FOR_REVIEW',@dummy_admin_id,'Development dummy transition',UTC_TIMESTAMP()
WHERE NOT EXISTS(SELECT 1 FROM resume_request_status_logs WHERE request_id=@dummy_request_id AND reason='Development dummy transition');

INSERT INTO resume_request_sla_events(request_id,event_type,event_at,new_due_at,reason,created_by_user_id)
SELECT @dummy_request_id,'STARTED',UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 DAY),'Development dummy SLA',@dummy_admin_id
WHERE NOT EXISTS(SELECT 1 FROM resume_request_sla_events WHERE request_id=@dummy_request_id AND reason='Development dummy SLA');

INSERT INTO resume_revision_requests(public_id,request_id,revision_number,user_notes,status,requested_at)
VALUES(@dummy_revision_public_id,@dummy_request_id,1,'Development dummy revision','REQUESTED',UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE user_notes=VALUES(user_notes);

INSERT INTO resume_deliverables(public_id,request_id,version_number,file_id,uploaded_by_user_id,revision_number,state,is_current,release_notes,internal_notes,created_at)
VALUES(@dummy_deliverable_public_id,@dummy_request_id,1,@dummy_file_id,@dummy_admin_id,1,'REVIEW_CANDIDATE',1,'Development dummy release notes','Development only',UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE internal_notes=VALUES(internal_notes);
SET @dummy_deliverable_id=(SELECT id FROM resume_deliverables WHERE BINARY public_id=BINARY @dummy_deliverable_public_id);

INSERT INTO resume_quality_reviews(request_id,deliverable_id,reviewer_user_id,beneficiary_correct,factual_integrity_checked,spelling_formatting_checked,file_opens,no_macros,no_tracked_changes_comments,no_placeholders,ready_for_release,notes,created_at)
SELECT @dummy_request_id,@dummy_deliverable_id,@dummy_admin_id,1,1,1,1,1,1,1,1,'Development dummy quality review',UTC_TIMESTAMP()
WHERE NOT EXISTS(SELECT 1 FROM resume_quality_reviews WHERE deliverable_id=@dummy_deliverable_id AND reviewer_user_id=@dummy_admin_id);

INSERT INTO resume_download_logs(request_id,deliverable_id,user_id,downloaded_at,ip_hash,user_agent_summary)
SELECT @dummy_request_id,@dummy_deliverable_id,@dummy_user_id,UTC_TIMESTAMP(),SHA2('127.0.0.1',256),'Development dummy agent'
WHERE NOT EXISTS(SELECT 1 FROM resume_download_logs WHERE deliverable_id=@dummy_deliverable_id AND user_id=@dummy_user_id);

INSERT INTO resume_retention_notices(request_id,threshold_days,queued_at)
VALUES(@dummy_request_id,30,UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE queued_at=VALUES(queued_at);

INSERT INTO mail_outbox(public_id,user_id,template_key,recipient_email,subject,payload_text,priority,status,attempts,max_attempts,available_at,created_at,updated_at)
VALUES('00000000-0000-4000-8000-000000000115',@dummy_user_id,'starter.management','dummy.member@example.test','Development dummy mail','{}',999,'cancelled',0,1,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE status='cancelled';
SET @dummy_outbox_id=(SELECT id FROM mail_outbox WHERE public_id='00000000-0000-4000-8000-000000000115');

INSERT INTO mail_delivery_logs(outbox_id,message_id,transport,recipient_masked,status,response_code,response_message,created_at)
SELECT @dummy_outbox_id,'dummy-message','dummy','d***@example.test','cancelled','DUMMY','Development-only record',UTC_TIMESTAMP()
WHERE NOT EXISTS(SELECT 1 FROM mail_delivery_logs WHERE outbox_id=@dummy_outbox_id AND message_id='dummy-message');

INSERT INTO auth_rate_limits(bucket_hash,action,hits,window_started_at,expires_at,created_at,updated_at)
VALUES(SHA2('dummy-rate-limit',256),'dummy',1,UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 HOUR),UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at);

INSERT INTO activity_logs(user_id,card_id,event,actor_ip_hash,request_id,metadata_text,created_at)
SELECT @dummy_user_id,@dummy_card_id,'dummy.seeded',SHA2('127.0.0.1',256),'dummy-seed','{}',UTC_TIMESTAMP()
WHERE NOT EXISTS(SELECT 1 FROM activity_logs WHERE request_id='dummy-seed' AND event='dummy.seeded');

INSERT INTO admin_interventions(public_id,actor_user_id,target_user_id,action,entity_type,entity_public_id,previous_value_text,new_value_text,reason,correlation_id,created_at)
VALUES('00000000-0000-4000-8000-000000000116',@dummy_admin_id,@dummy_user_id,'DUMMY','user',@dummy_user_public_id,NULL,'{}','Development dummy intervention','dummy-seed',UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE reason=VALUES(reason);

INSERT INTO website_settings(setting_key,setting_group,value_text,classification,is_editable,updated_by_user_id,created_at,updated_at)
VALUES('dummy.qa.enabled','development','true','public',1,@dummy_admin_id,UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at);
SET @dummy_setting_id=(SELECT id FROM website_settings WHERE setting_key='dummy.qa.enabled');

INSERT INTO setting_change_logs(setting_id,actor_user_id,previous_value_text,new_value_text,reason,created_at)
SELECT @dummy_setting_id,@dummy_admin_id,'false','true','Development dummy setting change',UTC_TIMESTAMP()
WHERE NOT EXISTS(SELECT 1 FROM setting_change_logs WHERE setting_id=@dummy_setting_id AND reason='Development dummy setting change');

INSERT INTO usage_adjustments(public_id,user_id,feature_key,delta_value,actor_user_id,reason,created_at)
VALUES('00000000-0000-4000-8000-000000000117',@dummy_user_id,'dummy_feature',1,@dummy_admin_id,'Development dummy usage',UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE reason=VALUES(reason);

INSERT INTO user_tier_history(user_id,from_tier,to_tier,source,actor_user_id,reason,starts_at,created_at)
SELECT @dummy_user_id,'basic','pro','dummy',@dummy_admin_id,'Development dummy tier history',UTC_TIMESTAMP(),UTC_TIMESTAMP()
WHERE NOT EXISTS(SELECT 1 FROM user_tier_history WHERE user_id=@dummy_user_id AND reason='Development dummy tier history');

INSERT INTO user_feedback(public_id,user_id,message,status,created_at,updated_at)
VALUES('00000000-0000-4000-8000-000000000118',@dummy_user_id,'Development dummy feedback','closed',UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at);

INSERT INTO email_template_versions(template_key,version,content_text,actor_public_id,reason,created_at)
VALUES('starter.management',999,JSON_OBJECT(
  'schemaVersion',1,'locale','id','subject','Development dummy template','preheader','','heading','Dummy','footer','',
  'blocks',JSON_ARRAY(JSON_OBJECT('type','action','targetVariable','cardUrl','label','Kartu Anda'),JSON_OBJECT('type','action','targetVariable','manageUrl','label','Kelola kartu'),JSON_OBJECT('type','system','key','starterAccessNotice')),
  'style',JSON_OBJECT('logoAssetKey',NULL,'logoAlt','','backgroundColor','#ffffff','textColor','#172033','accentColor','#006b80')
),@dummy_admin_public_id,'Development dummy version',UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE content_text=VALUES(content_text);

INSERT INTO email_template_actions(actor_public_id,action_key,template_key,action,payload_hash,result_text,reason,request_id,created_at)
VALUES(@dummy_admin_public_id,'00000000-0000-4000-8000-000000000119','starter.management','dummy',SHA2('{}',256),'{}','Development dummy action','dummy-seed',UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE result_text=VALUES(result_text);

INSERT INTO email_template_tests(public_id,template_key,actor_public_id,content_text,status,error_code,created_at,updated_at)
VALUES('00000000-0000-4000-8000-000000000120','starter.management',@dummy_admin_public_id,'Development dummy test','cancelled','DUMMY',UTC_TIMESTAMP(),UTC_TIMESTAMP())
ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at);

COMMIT;
