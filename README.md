# 🐻 我的專案手帳 (pm-tracker)

自用嘅簡易 Project Manager：GitHub Pages 靜態網站 + Supabase (登入 + 資料庫) + GitHub Actions 每日 9:00 寄 follow-up email。

網站本身係公開嘅 code，但入面冇任何公司資料 —— 真正資料存喺 Supabase，靠登入 + Row Level Security 保護，其他人有網址都睇唔到你嘅嘢。

## 一次性設定

### 1. 開 Supabase project
1. 去 https://supabase.com 開一個新 project（免費 plan 就夠）。
2. 左側選單 **SQL Editor** -> New query，貼晒本地 `db/schema.sql`（喺你部電腦嘅 `pm-tracker/db/` 資料夾入面，冇放上 GitHub）成份內容，按 Run。
3. 左側選單 **Authentication -> Users** -> Add user，用你自己個 email + 密碼開一個帳戶（呢個網站冇做「註冊」畫面，淨係你一個人用）。
4. 左側選單 **Project Settings -> API**，攞返：
   - `Project URL`
   - `anon public` key
   - `service_role` key（呢條千其唔好放入網站 code，淨係俾 GitHub Actions 用）

### 2. 填網站設定
編輯 [`js/config.js`](js/config.js)，將 `SUPABASE_URL` 同 `SUPABASE_ANON_KEY` 換成你自己個 project 嘅值。

### 3. 開 Gmail App Password（用嚟寄 email）
1. 你個 Gmail 帳戶要先開咗兩步驗證。
2. 去 https://myaccount.google.com/apppasswords 開一個 App Password（揀 Mail / Other）。
3. 記低嗰 16 位密碼。

### 4. 建 GitHub repo 同加 Secrets
1. 將呢個 `pm-tracker` 資料夾 push 去一個新嘅 GitHub repo（public 就得，入面冇公司資料）。
2. Repo 頁面 -> **Settings -> Secrets and variables -> Actions -> New repository secret**，加：
   | Secret 名 | 值 |
   |---|---|
   | `SUPABASE_URL` | 同 step 1 個 Project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | 同 step 1 個 service_role key |
   | `GMAIL_USER` | 你個 Gmail 地址 |
   | `GMAIL_APP_PASSWORD` | step 3 個 16 位密碼 |
   | `RECIPIENT_EMAIL` | 想收 email 嘅地址（例如 angela.wong@systemweb.com.hk） |

### 5. 開 GitHub Pages
Repo -> **Settings -> Pages** -> Source 揀 `Deploy from a branch` -> Branch 揀 `main` / `root` -> Save。
過一陣網站就會喺 `https://<你嘅github帳戶>.github.io/<repo名>/` 出現。

## 測試每日 email
唔想等第二日 9:00，可以去 repo 嘅 **Actions** tab -> `Daily follow-up email` -> **Run workflow** 手動試跑一次。

## 日常使用
- 網站入面登入 -> 加 project（例如 🐣 客戶A、🎻 客戶B）-> 加 task，填 follow-up 日期。
- 到咗 follow-up 日期或者過咗期，個 task 會自動標「🔥 今日」/「⏰ 逾期」。
- 每日香港時間 9:00，GitHub Actions 會自動寄一封 email 列晒「今日 + 逾期」嘅 task 俾你。
