-- Migration: 為 tasks 新增「相關網頁連結」欄位
-- 喺 Supabase SQL Editor 度貼晒呢份 -> Run

alter table tasks
  add column if not exists link text;
