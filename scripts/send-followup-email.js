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
    .select("title, notes, follow_up_date, notify_daily, projects(icon, name)")
    .eq("status", "active")
    .order("follow_up_date", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("Failed to load tasks from Supabase:", error.message);
    process.exit(1);
  }

  const activeTasks = tasks || [];

  if (activeTasks.length === 0) {
    console.log("No active tasks, skipping email.");
    return;
  }

  const groups = groupByProject(activeTasks);
  const html = renderEmailHtml(today, groups);
  const text = renderEmailText(today, groups);

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

  console.log(
    `Email sent to ${RECIPIENT_EMAIL} with ${activeTasks.length} active tasks across ${groups.length} project group(s).`
  );
}

function groupByProject(tasks) {
  const map = new Map();
  for (const t of tasks) {
    const key = t.projects ? t.projects.name : "未分類";
    const icon = t.projects ? t.projects.icon : "🗂️";
    if (!map.has(key)) map.set(key, { icon, name: key, tasks: [] });
    map.get(key).tasks.push(t);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
}

function dateTag(t, today) {
  if (!t.follow_up_date) return "";
  if (t.follow_up_date === today) return "🔥 今日";
  if (t.follow_up_date < today) return "⏰ 逾期";
  return `📅 ${t.follow_up_date}`;
}

function line(t, today) {
  const tag = dateTag(t, today);
  const pin = t.notify_daily ? "📌 持續提醒" : "";
  const tags = [tag, pin].filter(Boolean).join(" ");
  const notes = t.notes ? ` — ${t.notes}` : "";
  return `${t.title}${tags ? ` [${tags}]` : ""}${notes}`;
}

function renderEmailText(today, groups) {
  const parts = [`今日日期：${today}`, ""];
  for (const g of groups) {
    parts.push(`${g.icon} ${g.name}`);
    g.tasks.forEach((t) => parts.push(" - " + line(t, today)));
    parts.push("");
  }
  return parts.join("\n").trim();
}

function renderEmailHtml(today, groups) {
  const tagHtml = (tag) => {
    if (!tag) return "";
    if (tag.includes("今日")) return `<span style="color:#c26a00;font-weight:bold;">${tag}</span>`;
    if (tag.includes("逾期")) return `<span style="color:#b0323f;font-weight:bold;">${tag}</span>`;
    return `<span style="color:#8a7a86;">${tag}</span>`;
  };
  const pinHtml = (t) =>
    t.notify_daily
      ? ` <span style="background:#ffe0ee;color:#8a2e5e;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:bold;">📌 持續提醒，要注意</span>`
      : "";

  const section = (g) => `
    <h3 style="margin-bottom:4px;">${escapeHtml(g.icon)} ${escapeHtml(g.name)}</h3>
    <ul style="margin-top:4px;">
      ${g.tasks
        .map(
          (t) => `<li style="margin-bottom:4px;">
            <b>${escapeHtml(t.title)}</b>
            ${tagHtml(dateTag(t, today))}
            ${pinHtml(t)}
            ${t.notes ? `<br/><span style="color:#8a7a86;">${escapeHtml(t.notes)}</span>` : ""}
          </li>`
        )
        .join("")}
    </ul>
  `;

  return `
    <div style="font-family:sans-serif;font-size:14px;color:#5b4b57;">
      <h2>📋 今日 Follow-up 清單</h2>
      <p style="color:#8a7a86;">${today}</p>
      ${groups.map(section).join("")}
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
