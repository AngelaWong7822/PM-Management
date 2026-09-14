-- PM Tracker schema
-- 喺 Supabase 專案入面：左側選單 SQL Editor -> New query -> 貼晒呢份 -> Run

create extension if not exists "pgcrypto";

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '📁',
  color text not null default '#ffd6e8',
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  title text not null,
  notes text,
  follow_up_date date,
  status text not null default 'active' check (status in ('active', 'done', 'archived')),
  kind text not null default 'self' check (kind in ('self', 'delegated')),
  completed_at date,
  link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_status_idx on tasks (user_id, status);
create index if not exists tasks_follow_up_date_idx on tasks (follow_up_date);

-- 附件（PDF / Word / 圖片等），檔案存喺 storage bucket "task-attachments"，
-- 路徑格式係 <user_id>/<task_id>/<檔名>
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

drop policy if exists "own attachments select" on storage.objects;
create policy "own attachments select" on storage.objects
  for select using (
    bucket_id = 'task-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "own attachments insert" on storage.objects;
create policy "own attachments insert" on storage.objects
  for insert with check (
    bucket_id = 'task-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "own attachments delete" on storage.objects;
create policy "own attachments delete" on storage.objects
  for delete using (
    bucket_id = 'task-attachments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create table if not exists task_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  size_bytes bigint,
  created_at timestamptz not null default now()
);

create index if not exists task_attachments_task_id_idx on task_attachments (task_id);

alter table projects enable row level security;
alter table tasks enable row level security;
alter table task_attachments enable row level security;

drop policy if exists "own task_attachments" on task_attachments;
create policy "own task_attachments" on task_attachments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own projects" on projects;
create policy "own projects" on projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own tasks" on tasks;
create policy "own tasks" on tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tasks_set_updated_at on tasks;
create trigger tasks_set_updated_at
  before update on tasks
  for each row
  execute function set_updated_at();
