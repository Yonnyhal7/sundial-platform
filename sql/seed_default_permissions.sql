create unique index if not exists permissions_key_unique
on public.permissions (key);

insert into public.permissions (key, label, description)
values
('announcements', 'Announcements', 'Create and manage school announcements'),
('events', 'Events', 'Create and manage school events'),
('athletics', 'Athletics', 'Create and manage sports, teams, and games'),
('schedules', 'Schedules', 'Create and manage bell schedules'),
('calendar', 'Calendar', 'Assign schedules to calendar days'),
('resources', 'Resources', 'Create and manage school resources'),
('kiosk', 'Kiosk', 'Manage kiosk display settings'),
('analytics', 'Analytics', 'View school analytics'),
('users', 'Users', 'Manage users and permissions')
on conflict (key) do nothing;
