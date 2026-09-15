import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ATTACHMENT_BUCKET = "task-attachments";
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20MB

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
const taskGraceInput = document.getElementById("task-grace");
const taskLinkInput = document.getElementById("task-link");
const taskAttachmentInput = document.getElementById("task-attachment");
const taskAttachmentNameEl = document.getElementById("task-attachment-name");
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
let tasksCache = [];
let editingTaskId = null;
let currentUserId = null;
let expandedMenuIds = new Set();

function todayStr() {
  return new Date().toLocaleDateString("sv-SE"); // yyyy-mm-dd, 用本地時區
}

function setDefaultTaskDate() {
  taskDateInput.value = todayStr();
}

taskAttachmentInput.addEventListener("change", () => {
  const file = taskAttachmentInput.files[0];
  taskAttachmentNameEl.textContent = file ? `📄 ${file.name}` : "";
});

function dateOnly(isoTimestamp) {
  return isoTimestamp ? isoTimestamp.slice(0, 10) : "";
}

function addDaysStr(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + (days || 0));
  return d.toLocaleDateString("sv-SE");
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

function sanitizeFileName(name) {
  const dotIndex = name.lastIndexOf(".");
  const ext = dotIndex > -1 ? name.slice(dotIndex).replace(/[^\w.]+/g, "") : "";
  const base = dotIndex > -1 ? name.slice(0, dotIndex) : name;
  const safeBase = base
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "_")
    .slice(0, 60);
  return (safeBase || "file") + ext;
}

function attachmentIcon(fileName) {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "🖼️";
  if (ext === "pdf") return "📕";
  if (["doc", "docx"].includes(ext)) return "📄";
  return "📎";
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
  setDefaultTaskDate();
  const { data: { user } } = await supabase.auth.getUser();
  currentUserId = user?.id || null;
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

    const label = document.createElement("span");
    label.textContent = `${p.icon} ${p.name}`;
    pill.appendChild(label);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "project-pill-delete";
    delBtn.dataset.id = p.id;
    delBtn.title = "刪除專案";
    delBtn.textContent = "✕";
    pill.appendChild(delBtn);

    projectListEl.appendChild(pill);
  }
}

projectListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".project-pill-delete");
  if (!btn) return;
  if (!confirm("確定要刪除這個專案嗎？相關的待辦事項將變成未分類。")) return;
  const { error } = await supabase.from("projects").delete().eq("id", btn.dataset.id);
  if (error) {
    alert("刪除專案失敗：" + error.message);
    return;
  }
  await loadProjects();
  await loadTasks();
});

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
    .select("*, projects(icon, name, color), task_attachments(*)")
    .eq("status", currentStatus)
    .order("follow_up_date", { ascending: true, nullsFirst: false });
  if (error) {
    taskListEl.innerHTML = `<p class="empty-hint">載入失敗：${error.message}</p>`;
    return;
  }
  tasksCache = data || [];
  editingTaskId = null;
  renderTasks(tasksCache);
}

function projectOptionsHtml(selectedId) {
  let html = `<option value="" ${!selectedId ? "selected" : ""}>🗂️ 未分類</option>`;
  for (const p of projects) {
    html += `<option value="${p.id}" ${p.id === selectedId ? "selected" : ""}>${escapeHtml(p.icon)} ${escapeHtml(
      p.name
    )}</option>`;
  }
  return html;
}

function renderEditForm(t) {
  return `
    <form class="task-edit-form" data-id="${t.id}">
      <input type="text" class="edit-title" value="${escapeHtml(t.title)}" required />
      <select class="edit-project">${projectOptionsHtml(t.project_id)}</select>
      <select class="edit-kind">
        <option value="self" ${t.kind !== "delegated" ? "selected" : ""}>📌 自行跟進</option>
        <option value="delegated" ${t.kind === "delegated" ? "selected" : ""}>📤 已轉交他人</option>
      </select>
      <input type="date" class="edit-date" value="${t.follow_up_date || ""}" />
      <input type="number" class="edit-grace" min="0" value="${t.overdue_grace_days || 0}" title="逾期寬限日數" />
      <input type="url" class="edit-link" value="${escapeHtml(t.link || "")}" placeholder="🔗 相關網頁連結（選填）" />
      <textarea class="edit-notes" rows="2" placeholder="🖊️ 備註（選填）">${escapeHtml(t.notes || "")}</textarea>
      <div class="task-actions">
        <button type="submit" class="btn btn-primary">💾 儲存</button>
        <button type="button" class="btn btn-ghost" data-action="cancel-edit">取消</button>
      </div>
    </form>
  `;
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
    if (t.projects) {
      card.style.borderLeftWidth = "5px";
      card.style.borderLeftColor = t.projects.color;
    }

    if (editingTaskId === t.id) {
      card.innerHTML = renderEditForm(t);
      taskListEl.appendChild(card);
      continue;
    }

    const badges = [];
    if (t.projects) {
      badges.push(
        `<span class="badge badge-project" style="background:${escapeHtml(t.projects.color)}">${escapeHtml(
          t.projects.icon
        )} ${escapeHtml(t.projects.name)}</span>`
      );
    }
    badges.push(
      t.kind === "delegated"
        ? `<span class="badge badge-delegated">📤 已轉交他人</span>`
        : `<span class="badge badge-self">📌 自行跟進</span>`
    );
    if (t.follow_up_date) {
      const graceEndDate = addDaysStr(t.follow_up_date, t.overdue_grace_days);
      if (t.follow_up_date === today && t.status === "active") {
        badges.push(`<span class="badge badge-today">🔥 今日</span>`);
      } else if (t.status === "active" && graceEndDate < today) {
        badges.push(`<span class="badge badge-overdue">⏰ 逾期</span>`);
      } else if (t.status === "active" && t.follow_up_date < today) {
        badges.push(`<span class="badge badge-grace">⏳ 寬限中(至 ${graceEndDate})</span>`);
      } else {
        badges.push(`<span class="badge badge-date">📅 ${t.follow_up_date}</span>`);
      }
    }
    if (t.notify_daily) {
      badges.push(`<span class="badge badge-pinned">📌 持續提醒</span>`);
    }
    if (t.status === "done") {
      const doneDate = t.completed_at || dateOnly(t.updated_at);
      badges.push(`<span class="badge badge-done-date">✅ 完成 ${doneDate}</span>`);
    }

    const actions = [];
    const extraActions = [];
    const linkHref = safeLinkHref(t.link);
    if (linkHref) {
      actions.push(
        `<a class="btn btn-icon" href="${escapeHtml(linkHref)}" target="_blank" rel="noopener noreferrer">🔗 開啟連結</a>`
      );
    }
    if (t.status === "active") {
      actions.push(`<button class="btn btn-icon" data-action="done" data-id="${t.id}">✅ 完成</button>`);
      extraActions.push(
        `<button class="btn btn-icon" data-action="toggle-notify" data-id="${t.id}">${
          t.notify_daily ? "🔕 取消提醒" : "🔔 持續提醒"
        }</button>`
      );
      extraActions.push(`<button class="btn btn-icon" data-action="archive" data-id="${t.id}">🗄️ 封存</button>`);
    } else if (t.status === "done") {
      actions.push(`<button class="btn btn-icon" data-action="reopen" data-id="${t.id}">↩️ 重開</button>`);
      extraActions.push(`<button class="btn btn-icon" data-action="archive" data-id="${t.id}">🗄️ 封存</button>`);
    } else {
      actions.push(`<button class="btn btn-icon" data-action="reopen" data-id="${t.id}">↩️ 重開</button>`);
    }
    extraActions.push(`<button class="btn btn-icon" data-action="edit" data-id="${t.id}">✏️ 編輯</button>`);
    extraActions.push(`<button class="btn btn-icon" data-action="delete" data-id="${t.id}">🗑️ 刪除</button>`);
    const menuOpen = expandedMenuIds.has(t.id);
    actions.push(
      `<button type="button" class="btn btn-icon" data-action="toggle-menu" data-id="${t.id}">${
        menuOpen ? "▲ 收起" : "⋯ 更多"
      }</button>`
    );

    const attachments = t.task_attachments || [];
    const attachmentChips = attachments
      .map(
        (a) => `
          <span class="attachment-chip">
            ${attachmentIcon(a.file_name)} ${escapeHtml(a.file_name)}
            <button type="button" class="attachment-mini-btn" data-action="open-attachment" data-path="${escapeHtml(
              a.storage_path
            )}" title="開啟附件">🔗</button>
            <button type="button" class="attachment-mini-btn" data-action="delete-attachment" data-id="${a.id}" data-path="${escapeHtml(
              a.storage_path
            )}" title="刪除附件">✕</button>
          </span>
        `
      )
      .join("");

    const uploadControl = `
      <label class="attachment-upload-label">
        📎 上傳附件
        <input type="file" class="attachment-upload-input" data-task-id="${t.id}" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" hidden />
      </label>
    `;

    card.innerHTML = `
      <div class="task-top">
        <span class="task-title">${escapeHtml(t.title)}</span>
      </div>
      <div class="task-badges">${badges.join("")}</div>
      ${t.notes ? `<div class="task-notes">🖊️ ${escapeHtml(t.notes)}</div>` : ""}
      ${attachmentChips ? `<div class="task-attachments">${attachmentChips}</div>` : ""}
      <div class="task-actions">${actions.join("")}</div>
      <div class="task-actions task-actions-extra${menuOpen ? "" : " hidden"}">${extraActions.join(
      ""
    )}${uploadControl}</div>
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

  if (action === "edit") {
    editingTaskId = id;
    renderTasks(tasksCache);
    return;
  }
  if (action === "cancel-edit") {
    editingTaskId = null;
    renderTasks(tasksCache);
    return;
  }

  if (action === "toggle-menu") {
    if (expandedMenuIds.has(id)) expandedMenuIds.delete(id);
    else expandedMenuIds.add(id);
    renderTasks(tasksCache);
    return;
  }

  if (action === "toggle-notify") {
    const task = tasksCache.find((x) => x.id === id);
    const { error } = await supabase.from("tasks").update({ notify_daily: !task?.notify_daily }).eq("id", id);
    if (error) alert("更新失敗：" + error.message);
    await loadTasks();
    return;
  }

  if (action === "open-attachment") {
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(btn.dataset.path, 60);
    if (error) {
      alert("開啟附件失敗：" + error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    return;
  }

  if (action === "delete-attachment") {
    if (!confirm("確定要刪除這個附件嗎？")) return;
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([btn.dataset.path]);
    const { error } = await supabase.from("task_attachments").delete().eq("id", id);
    if (error) alert("刪除附件失敗：" + error.message);
    await loadTasks();
    return;
  }

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

taskListEl.addEventListener("submit", async (e) => {
  const form = e.target.closest(".task-edit-form");
  if (!form) return;
  e.preventDefault();
  const title = form.querySelector(".edit-title").value.trim();
  if (!title) return;
  const payload = {
    title,
    project_id: form.querySelector(".edit-project").value || null,
    kind: form.querySelector(".edit-kind").value,
    follow_up_date: form.querySelector(".edit-date").value || null,
    overdue_grace_days: Number(form.querySelector(".edit-grace").value) || 0,
    link: form.querySelector(".edit-link").value.trim() || null,
    notes: form.querySelector(".edit-notes").value.trim() || null,
  };
  const { error } = await supabase.from("tasks").update(payload).eq("id", form.dataset.id);
  if (error) {
    alert("更新失敗：" + error.message);
    return;
  }
  await loadTasks();
});

async function uploadAttachment(taskId, file) {
  if (file.size > MAX_ATTACHMENT_SIZE) {
    alert("檔案過大，上限為 20MB。");
    return false;
  }
  if (!currentUserId) {
    alert("上傳失敗：找不到目前使用者，請重新登入。");
    return false;
  }

  const path = `${currentUserId}/${taskId}/${Date.now()}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file);
  if (uploadError) {
    alert("上傳失敗：" + uploadError.message);
    return false;
  }

  const { error: insertError } = await supabase.from("task_attachments").insert({
    task_id: taskId,
    file_name: file.name,
    storage_path: path,
    size_bytes: file.size,
  });
  if (insertError) {
    alert("上傳失敗：" + insertError.message);
    return false;
  }
  return true;
}

taskListEl.addEventListener("change", async (e) => {
  const input = e.target.closest(".attachment-upload-input");
  if (!input || !input.files.length) return;
  const file = input.files[0];
  const ok = await uploadAttachment(input.dataset.taskId, file);
  input.value = "";
  if (ok) await loadTasks();
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
    overdue_grace_days: Number(taskGraceInput.value) || 0,
    link: taskLinkInput.value.trim() || null,
    notes: taskNotesInput.value.trim() || null,
  };
  const { data, error } = await supabase.from("tasks").insert(payload).select().single();
  if (error) {
    alert("新增失敗：" + error.message);
    return;
  }
  const file = taskAttachmentInput.files[0];
  if (file) {
    await uploadAttachment(data.id, file);
  }
  taskForm.reset();
  setDefaultTaskDate();
  taskAttachmentNameEl.textContent = "";
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
