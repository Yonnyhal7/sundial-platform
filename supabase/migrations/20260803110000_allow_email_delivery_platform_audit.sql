begin;

alter table public.platform_settings_audit
  drop constraint if exists platform_settings_audit_section_check;

alter table public.platform_settings_audit
  add constraint platform_settings_audit_section_check
  check (section in ('general', 'new_school_defaults', 'email_delivery'));

commit;
