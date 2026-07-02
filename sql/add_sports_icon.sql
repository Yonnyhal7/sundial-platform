alter table public.sports
add column if not exists icon text default 'generic';

update public.sports
set icon = 'generic'
where icon is null;
