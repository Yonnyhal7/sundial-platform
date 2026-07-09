alter table schools
add column if not exists district_name text,
add column if not exists default_appearance text not null default 'system',
add column if not exists main_office text,
add column if not exists attendance_office text,
add column if not exists counseling_office text,
add column if not exists athletics_office text,
add column if not exists address text,
add column if not exists phone_number text,
add column if not exists school_website text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'schools_default_appearance_check'
  ) then
    alter table schools
    add constraint schools_default_appearance_check
    check (default_appearance in ('light', 'dark', 'system'))
    not valid;
  end if;
end $$;

alter table schools validate constraint schools_default_appearance_check;

insert into storage.buckets (id, name, public)
values ('school-logos', 'school-logos', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload school logos'
  ) then
    create policy "Authenticated users can upload school logos"
    on storage.objects
    for insert
    to authenticated
    with check (bucket_id = 'school-logos');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Anyone can read school logos'
  ) then
    create policy "Anyone can read school logos"
    on storage.objects
    for select
    to public
    using (bucket_id = 'school-logos');
  end if;
end $$;
