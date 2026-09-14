import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logout-btn");

const taskForm = document.getElementById("task-form");
const taskTitleInput = document.getElementById("task-title");
const taskProjectSelect = document.getElementById("task-project");
const taskKindSelect = document.getElementById("task-kind");
const taskDateInput = document.getElementById("task-date");
const taskLinkInput = document.getElementById("task-link");
const taskNotesInput = document.getElementById("task-notes");

const projectForm = document.getElementById("project-form");
const projectIconInput = document.getElementById("project-icon");
const projectNameInput = document.getElementById("project-name");
const projectColorInput = document.getElementById("project-color");
const projectListEl = document.getElementById("project-list");
const projectToggleBtn = document.getElementById("project-toggle-btn");
const projectPanel = document.getElementById("project-panel");

const taskListEl = document.getElementById("task-list");
const tabButtons = document.querySelectorAll(".tab-btn");

let projects = [];
let currentStatus = "active";

function todayStr() {
  return new Date().toLocaleDateString("sv-SE"); // yyyy-mm-dd, 用本地時區
}

function dateOnly(isoTimestamp) {
  return isoTimestamp ? isoTimestamp.slice(0, 10) : "";
}

function safeLinkHref(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch (_) {
    // 不是有效網址，不顯示連結
  }
  return null;
}

// ---------- Auth ----------
async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    showApp();
  } else {
    showLogin();
  }
}

function showLogin() {
  loginScreen.classList.remove("hidden");
  appScreen.classList.add("hidden");
}

async function showApp() {
  loginScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");
  await loadProjects();
  await loadTasks();
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    loginError.textContent = "❌ 登入失敗：" + error.message;
    return;
  }
  await showApp();
});

logoutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  showLogin();
});

projectToggleBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  projectPanel.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (projectPanel.classList.contains("hidden")) return;
  if (projectPanel.contains(e.target) || e.target === projectToggleBtn) return;
  projectPanel.classList.add("hidden");
});

// ---------- Projects ----------
async function loadProjects() {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  projects = data || [];
  renderProjectOptions();
  renderProjectPills();
}

function renderProjectOptions() {
  taskProjectSelect.innerHTML = '<option value="">🗂️ 未分類</option>';
  for (const p of projects) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.icon} ${p.name}`;
    taskProjectSelect.appendChild(opt);
  }
}

function renderProjectPills() {
  projectListEl.innerHTML = "";
  if (projects.length === 0) {
    projectListEl.innerHTML = '<p class="empty-hint">尚未建立專案，請在下方新增一個。</p>';
    return;
  }
  for (const p of projects) {
    const pill = document.createElement("span");
    pill.className = "project-pill";
    pill.style.background = p.color;
    pill.textContent = `${p.icon} ${p.name}`;
    projectListEl.appendChild(pill);
  }
}

projectForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const icon = projectIconInput.value.trim() || "📁";
  const name = projectNameInput.value.trim();
  const color = projectColorInput.value;
  if (!name) return;
  const { error } = await supabase.from("projects").insert({ icon, name, color });
  if (error) {
    alert("新增專案失敗：" + error.message);
    return;
  }
  projectForm.reset();
  projectColorInput.value = "#ffd6e8";
  projectIconInput.value = "📁";
  await loadProjects();
});

// ---------- Tasks ----------
async function loadTasks() {
  taskListEl.innerHTML = '<p class="empty-hint">載入中…⏳</p>';
  const { data, error } = await supabase
    .from("tasks")
    .select("*, projects(icon, name, color)")
    .eq("status", currentStatus)
    .order("follow_up_date", { ascending: true, nullsFirst: false });
  if (error) {
    taskListEl.innerHTML = `<p class="empty-hint">載入失敗：${error.message}</p>`;
    return;
  }
  renderTasks(data || []);
}

function renderTasks(tasks) {
  if (tasks.length === 0) {
    taskListEl.innerHTML = '<p class="empty-hint">目前沒有項目 🌸</p>';
    return;
  }
  const today = todayStr();
  taskListEl.innerHTML = "";
  for (const t of tasks) {
    const card = document.createElement("div");
    card.className = "task-card";

    const badges = [];
    if (t.projects) {
      badges.push(`<span class="badge badge-project">${t.projects.icon} ${t.projects.name}</span>`);
    }
    badges.push(
      t.kind === "delegated"
        ? `<span class="badge badge-delegated">📤 已轉交他人</span>`
        : `<span class="badge badge-self">📌 自行跟進</span>`
    );
    if (t.follow_up_date) {
      if (t.follow_up_date === today && t.status === "active") {
        badges.push(`<span class="badge badge-today">🔥 今日</span>`);
      } else if (t.follow_up_date < today && t.status === "active") {
        badges.push(`<span class="badge badge-overdue">⏰ 逾期</span>`);
      } else {
        badges.push(`<span class="badge badge-date">📅 ${t.follow_up_date}</span>`);
      }
    }
    badges.push(`<span class="badge badge-start">🌱 開始 ${dateOnly(t.created_at)}</span>`);
    if (t.status === "done" && t.completed_at) {
      badges.push(`<span class="badge badge-done-date">✅ 完成 ${t.completed_at}</span>`);
    }

    const actions = [];
    const linkHref = safeLinkHref(t.link);
    if (linkHref) {
      actions.push(
        `<a class="btn btn-icon" href="${escapeHtml(linkHref)}" target="_blank" rel="noopener noreferrer">🔗 開啟連結</a>`
      );
    }
    if (t.status === "active") {
      actions.push(`<button class="btn btn-icon" data-action="done" data-id="${t.id}">✅ 完成</button>`);
      actions.push(`<button class="btn btn-icon" data-action="archive" data-id="${t.id}">🗄️ 封存</button>`);
    } else if (t.status === "done") {
      actions.push(`<button class="btn btn-icon" data-action="reopen" data-id="${t.id}">↩️ 重開</button>`);
      actions.push(`<button class="btn btn-icon" data-action="archive" data-id="${t.id}">🗄️ 封存</button>`);
    } else {
      actions.push(`<button class="btn btn-icon" data-action="reopen" data-id="${t.id}">↩️ 重開</button>`);
      actions.push(`<button class="btn btn-icon" data-action="delete" data-id="${t.id}">🗑️ 刪除</button>`);
    }

    card.innerHTML = `
      <div class="task-top">
        <span class="task-title">${escapeHtml(t.title)}</span>
      </div>
      <div class="task-badges">${badges.join("")}</div>
      ${t.notes ? `<div class="task-notes">🖊️ ${escapeHtml(t.notes)}</div>` : ""}
      <div class="task-actions">${actions.join("")}</div>
    `;
    taskListEl.appendChild(card);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML.replace(/"/g, "&quot;");
}

taskListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  let update = null;
  if (action === "done") update = { status: "done", completed_at: todayStr() };
  else if (action === "archive") update = { status: "archived" };
  else if (action === "reopen") update = { status: "active", completed_at: null };

  if (action === "delete") {
    if (!confirm("確定要刪除這個項目嗎？此操作無法復原。")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) alert("刪除失敗：" + error.message);
  } else if (update) {
    const { error } = await supabase.from("tasks").update(update).eq("id", id);
    if (error) alert("更新失敗：" + error.message);
  }
  await loadTasks();
});

taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = taskTitleInput.value.trim();
  if (!title) return;
  const payload = {
    title,
    project_id: taskProjectSelect.value || null,
    kind: taskKindSelect.value,
    follow_up_date: taskDateInput.value || null,
    link: taskLinkInput.value.trim() || null,
    notes: taskNotesInput.value.trim() || null,
  };
  const { error } = await supabase.from("tasks").insert(payload);
  if (error) {
    alert("新增失敗：" + error.message);
    return;
  }
  taskForm.reset();
  if (currentStatus === "active") await loadTasks();
});

// ---------- Tabs ----------
tabButtons.forEach((btn) => {
  btn.addEventListener("click", async () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentStatus = btn.dataset.status;
    await loadTasks();
  });
});

checkSession();
