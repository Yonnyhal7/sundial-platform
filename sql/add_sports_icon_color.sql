alter table public.sports
add column if not exists icon_color text default '#2563eb';

update public.sports
set icon_color = '#2563eb'
where icon_color is null or icon_color = '';
