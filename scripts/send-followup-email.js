import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  RECIPIENT_EMAIL,
} = process.env;

for (const [name, value] of Object.entries({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  RECIPIENT_EMAIL,
})) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function todayInHongKong() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Hong_Kong" }).format(new Date());
}

async function main() {
  const today = todayInHongKong();

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("title, notes, follow_up_date, projects(icon, name)")
    .eq("status", "active")
    .lte("follow_up_date", today)
    .order("follow_up_date", { ascending: true });

  if (error) {
    console.error("Failed to load tasks from Supabase:", error.message);
    process.exit(1);
  }

  const dueToday = (tasks || []).filter((t) => t.follow_up_date === today);
  const overdue = (tasks || []).filter((t) => t.follow_up_date < today);

  if (dueToday.length === 0 && overdue.length === 0) {
    console.log("No follow-ups due today, skipping email.");
    return;
  }

  const html = renderEmailHtml(today, dueToday, overdue);
  const text = renderEmailText(today, dueToday, overdue);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  await transporter.sendMail({
    from: `"🐻 專案手帳" <${GMAIL_USER}>`,
    to: RECIPIENT_EMAIL,
    subject: `📋 今日 Follow-up 清單 (${today})`,
    text,
    html,
  });

  console.log(`Email sent to ${RECIPIENT_EMAIL} with ${dueToday.length} due today, ${overdue.length} overdue.`);
}

function line(t) {
  const tag = t.projects ? `${t.projects.icon} ${t.projects.name}` : "🗂️ 未分類";
  const notes = t.notes ? ` — ${t.notes}` : "";
  return `${tag}：${t.title}${notes}`;
}

function renderEmailText(today, dueToday, overdue) {
  const parts = [`今日日期：${today}`, ""];
  if (dueToday.length) {
    parts.push("🔥 今日要 Follow-up：");
    dueToday.forEach((t) => parts.push(" - " + line(t)));
    parts.push("");
  }
  if (overdue.length) {
    parts.push("⏰ 逾期未跟：");
    overdue.forEach((t) => parts.push(" - " + line(t)));
  }
  return parts.join("\n");
}

function renderEmailHtml(today, dueToday, overdue) {
  const section = (title, items) =>
    items.length
      ? `<h3>${title}</h3><ul>${items
          .map(
            (t) =>
              `<li><b>${escapeHtml(t.projects ? `${t.projects.icon} ${t.projects.name}` : "🗂️ 未分類")}</b>：${escapeHtml(
                t.title
              )}${t.notes ? ` <span style="color:#8a7a86;">— ${escapeHtml(t.notes)}</span>` : ""}</li>`
          )
          .join("")}</ul>`
      : "";

  return `
    <div style="font-family:sans-serif;font-size:14px;color:#5b4b57;">
      <h2>📋 今日 Follow-up 清單</h2>
      <p style="color:#8a7a86;">${today}</p>
      ${section("🔥 今日要 Follow-up", dueToday)}
      ${section("⏰ 逾期未跟", overdue)}
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
