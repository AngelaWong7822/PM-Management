-- Migration: add ticket 類型 (自己跟 / 交咗畀人) 同 完成日期
-- 你個 tasks table 已經存在，所以要跑呢個 migration 嚟加新欄
-- 喺 Supabase SQL Editor 度貼晒呢份 -> Run

alter table tasks
  add column if not exists kind text not null default 'self' check (kind in ('self', 'delegated'));

alter table tasks
  add column if not exists completed_at date;
