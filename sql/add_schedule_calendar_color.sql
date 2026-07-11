alter table public.schedules
add column if not exists calendar_color text;

alter table public.schedules
drop constraint if exists schedules_calendar_color_hex_check;

alter table public.schedules
add constraint schedules_calendar_color_hex_check
check (
  calendar_color is null
  or calendar_color ~ '^#[0-9A-Fa-f]{6}$'
);
