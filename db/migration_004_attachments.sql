-- Migration: 附件上傳（PDF / Word / 圖片等）
-- 喺 Supabase SQL Editor 度貼晒呢份 -> Run

-- 1. 建立私人 storage bucket
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

-- 2. Storage 權限：檔案路徑格式係 <user_id>/<task_id>/<檔名>，
--    確保用戶只可以存取自己個資料夾
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

-- 3. 記錄附件 metadata 嘅 table
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

alter table task_attachments enable row level security;

drop policy if exists "own task_attachments" on task_attachments;
create policy "own task_attachments" on task_attachments
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
