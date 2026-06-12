let members = [
  { id: "everyone", name: "全員", initial: "全", color: "everyone" },
];

const defaultTasks = [
  { id: 1, name: "クライアントへの提案資料を作成する", assignee: "sato", due: dateOffset(1), type: "todo", done: false },
  { id: 2, name: "デザインレビューの準備", assignee: "suzuki", due: dateOffset(3), type: "todo", done: false },
  { id: 3, name: "先週の振り返りメモを共有する", assignee: "tanaka", due: dateOffset(-1), type: "todo", done: true },
  { id: 4, name: "社内FAQを更新する", assignee: "yamamoto", due: dateOffset(6), type: "todo", done: false },
  { id: 5, name: "朝会で進捗を共有する", assignee: "tanaka", due: "", type: "routine", done: true },
  { id: 6, name: "メール・チャットを確認して返信する", assignee: "sato", due: "", type: "routine", done: false },
  { id: 7, name: "タスクの優先順位を見直す", assignee: "suzuki", due: "", type: "routine", done: false },
  { id: 8, name: "ナレッジベースを更新する", assignee: "yamamoto", due: "", type: "routine", done: true },
];

const state = { todoFilter: "all", tasks: loadTasks(), names: loadNames(), editingName: "app" };
const el = (id) => document.getElementById(id);

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function getSaturdayKey(date = new Date()) {
  const saturday = new Date(date);
  saturday.setDate(date.getDate() - ((date.getDay() + 1) % 7));
  return localDateKey(saturday);
}

function getNextWeekFriday(date = new Date()) {
  const friday = new Date(date);
  const daysUntilNextMonday = (8 - date.getDay()) % 7 || 7;
  friday.setDate(date.getDate() + daysUntilNextMonday + 4);
  return localDateKey(friday);
}

function loadTasks() {
  const stored = JSON.parse(localStorage.getItem("minna-tasks") || "null");
  const tasks = stored?.tasks || defaultTasks;
  const currentSaturday = getSaturdayKey();
  if (stored?.routineResetKey !== currentSaturday) {
    tasks.forEach((task) => { if (task.type === "routine") task.done = false; });
  }
  localStorage.setItem("minna-tasks", JSON.stringify({ tasks, routineResetKey: currentSaturday }));
  return tasks;
}

function saveTasks() {
  localStorage.setItem("minna-tasks", JSON.stringify({ tasks: state.tasks, routineResetKey: getSaturdayKey() }));
}

function syncTask(task) {
  TeamSync.upsertTask(task).catch((error) => showToast(`同期できませんでした: ${error.message}`));
}

function loadNames() {
  return JSON.parse(localStorage.getItem("minna-names") || "null") || { mark: "M", app: "みんなの仕事", team: "チームの仕事" };
}

function saveNames() {
  localStorage.setItem("minna-names", JSON.stringify(state.names));
}

function avatar(member) {
  return `<span class="avatar avatar-${member.color}">${member.initial}</span>`;
}

function isPastDue(task) {
  return Boolean(task.due && task.due < localDateKey(new Date()));
}

function formatDue(due) {
  if (!due) return "毎週";
  const date = new Date(`${due}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date - today) / 86400000);
  if (diff === 0) return "今日";
  if (diff === 1) return "明日";
  return `${date.getMonth() + 1}/${date.getDate()} (${["日","月","火","水","木","金","土"][date.getDay()]})`;
}

function todoVisible(task) {
  if (task.type !== "todo") return false;
  if (state.todoFilter === "done") return task.done;
  if (state.todoFilter === "open") return !task.done;
  return !task.done || !isPastDue(task);
}

function taskRow(task) {
  const member = members.find((item) => item.id === task.assignee) || members[0];
  const soon = task.due && task.due <= dateOffset(1);
  const routine = task.type === "routine";
  return `<div class="task-row ${routine ? "routine-row" : "todo-row"} ${task.done ? "done" : ""}">
    <div class="task-main">
      <input class="task-checkbox" type="checkbox" data-action="toggle" data-id="${task.id}" ${task.done ? "checked" : ""} aria-label="${escapeHtml(task.name)}を完了にする">
      <span class="task-name">${escapeHtml(task.name)}</span>
    </div>
    <div class="assignee task-assignee" title="${member.name}" aria-label="担当者: ${member.name}">${avatar(member)}</div>
    ${routine ? "" : `<div class="due ${soon && !task.done ? "soon" : ""}">${formatDue(task.due)}</div>`}
    <button class="delete-button" data-action="delete" data-id="${task.id}" aria-label="${escapeHtml(task.name)}を削除" title="削除">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg>
    </button>
  </div>`;
}

function render() {
  const todos = state.tasks.filter(todoVisible);
  const routines = state.tasks.filter((task) => task.type === "routine");
  el("todoList").innerHTML = todos.map(taskRow).join("");
  el("routineList").innerHTML = routines.map(taskRow).join("");
  el("todoEmpty").hidden = todos.length > 0;
  el("routineEmpty").hidden = routines.length > 0;
  el("brandMark").textContent = state.names.mark;
  el("appName").textContent = state.names.app;
  el("teamName").textContent = state.names.team;
  const selectedAssignee = el("taskAssignee").value || "everyone";
  el("taskAssignee").innerHTML = members.map((member) => `<option value="${member.id}">${member.name}</option>`).join("");
  if (members.some((member) => member.id === selectedAssignee)) el("taskAssignee").value = selectedAssignee;
  renderProgress();
}

function progressFor(tasks) {
  const done = tasks.filter((task) => task.done).length;
  return { done, total: tasks.length, percent: tasks.length ? Math.round(done / tasks.length * 100) : 0 };
}

function renderProgress() {
  const overall = progressFor(state.tasks);
  el("overallPercent").textContent = `${overall.percent}%`;
  el("overallFraction").textContent = `${overall.done}/${overall.total}`;
  el("overallDone").textContent = `${overall.done}件 完了`;
  el("overallOpen").textContent = `${overall.total - overall.done}件 未完了`;
  el("overallRing").style.background = ringBackground(overall.percent);
  el("memberList").innerHTML = members.filter((member) => member.id !== "everyone").map((member) => {
    const progress = progressFor(state.tasks.filter((task) => task.assignee === member.id));
    return `<div class="member-row">${avatar(member)}<span class="member-name">${member.name}<small>${progress.done}/${progress.total} 完了</small></span><div class="sidebar-ring small" style="background:${ringBackground(progress.percent)}"><span>${progress.percent}%</span></div></div>`;
  }).join("");
}

function ringBackground(percent) {
  return `conic-gradient(var(--green) ${percent}%, rgba(255,255,255,.18) ${percent}%)`;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message) {
  el("toast").textContent = message;
  el("toast").classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el("toast").classList.remove("show"), 2200);
}

function openModal(type = "todo") {
  el("taskType").value = type;
  el("taskName").value = "";
  el("taskDue").value = type === "todo" ? getNextWeekFriday() : "";
  updateDueField();
  el("modalBackdrop").hidden = false;
  setTimeout(() => el("taskName").focus(), 10);
}

function closeModal() { el("modalBackdrop").hidden = true; }
function updateDueField() {
  const todoSelected = el("taskType").value === "todo";
  el("dueLabel").hidden = !todoSelected;
  if (todoSelected && !el("taskDue").value) el("taskDue").value = getNextWeekFriday();
}

function openNameModal(type) {
  state.editingName = type;
  const appEdit = type === "app";
  el("nameModalTitle").textContent = appEdit ? "アプリ名とアイコンを編集" : "チーム名を編集";
  el("markField").hidden = !appEdit;
  el("brandMarkInput").value = state.names.mark;
  el("displayNameInput").value = state.names[type];
  el("nameModalBackdrop").hidden = false;
  setTimeout(() => el("displayNameInput").focus(), 10);
}

function closeNameModal() { el("nameModalBackdrop").hidden = true; }

function renderMemberEditor() {
  const editableMembers = members.filter((member) => member.id !== "everyone");
  el("memberEditorList").innerHTML = editableMembers.length ? editableMembers.map((member) => `
    <div class="member-editor-row" data-member-id="${member.id}">
      ${avatar(member)}
      <input value="${escapeHtml(member.name)}" maxlength="30" aria-label="${escapeHtml(member.name)}の名前" />
      <div class="member-editor-actions">
        <button type="button" data-member-action="rename" title="名前を保存" aria-label="${escapeHtml(member.name)}の名前を保存">✓</button>
        <button type="button" class="member-delete" data-member-action="delete" title="削除" aria-label="${escapeHtml(member.name)}を削除">×</button>
      </div>
    </div>`).join("") : "<p>登録されているメンバーはいません。</p>";
  el("addMemberForm").hidden = editableMembers.length >= 4;
}

function openMemberModal() {
  renderMemberEditor();
  el("memberModalBackdrop").hidden = false;
}

function closeMemberModal() { el("memberModalBackdrop").hidden = true; }

document.querySelectorAll("[data-todo-filter]").forEach((button) => button.addEventListener("click", () => {
  state.todoFilter = button.dataset.todoFilter;
  document.querySelectorAll("[data-todo-filter]").forEach((item) => item.classList.toggle("active", item === button));
  render();
}));

document.querySelectorAll(".task-list").forEach((list) => list.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const task = state.tasks.find((item) => item.id === Number(target.dataset.id));
  if (!task) return;
  if (target.dataset.action === "toggle") {
    task.done = target.checked;
    showToast(task.done ? "タスクを完了にしました" : "タスクを未完了に戻しました");
    syncTask(task);
  } else {
    state.tasks = state.tasks.filter((item) => item.id !== task.id);
    showToast("タスクを削除しました");
    TeamSync.deleteTask(task.id).catch((error) => showToast(`削除を同期できませんでした: ${error.message}`));
  }
  saveTasks();
  render();
}));

el("taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const type = el("taskType").value;
  const task = { id: Date.now(), name: el("taskName").value.trim(), assignee: el("taskAssignee").value, due: type === "routine" ? "" : el("taskDue").value, type, done: false };
  state.tasks.unshift(task);
  syncTask(task);
  saveTasks();
  closeModal();
  render();
  showToast("新しいタスクを追加しました");
  document.getElementById(`${type}Section`).scrollIntoView({ behavior: "smooth" });
});

el("nameForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (state.editingName === "app") state.names.mark = el("brandMarkInput").value.trim() || "M";
  state.names[state.editingName] = el("displayNameInput").value.trim();
  saveNames();
  TeamSync.updateNames(state.names).catch((error) => showToast(`名称を同期できませんでした: ${error.message}`));
  closeNameModal();
  render();
  showToast("表示名を変更しました");
});

el("openAddButton").addEventListener("click", () => openModal());
el("taskType").addEventListener("change", updateDueField);
el("closeModalButton").addEventListener("click", closeModal);
el("modalBackdrop").addEventListener("click", (event) => { if (event.target === el("modalBackdrop")) closeModal(); });
el("closeNameModalButton").addEventListener("click", closeNameModal);
el("nameModalBackdrop").addEventListener("click", (event) => { if (event.target === el("nameModalBackdrop")) closeNameModal(); });
document.querySelectorAll("[data-edit-name]").forEach((button) => button.addEventListener("click", () => openNameModal(button.dataset.editName)));
el("editMembersButton").addEventListener("click", openMemberModal);
el("closeMemberModalButton").addEventListener("click", closeMemberModal);
el("memberModalBackdrop").addEventListener("click", (event) => { if (event.target === el("memberModalBackdrop")) closeMemberModal(); });
el("addMemberForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await TeamSync.addMember(el("newMemberNameInput").value.trim());
    el("newMemberNameInput").value = "";
    renderMemberEditor();
    showToast("メンバーを追加しました");
  } catch (error) { showToast(`追加できませんでした: ${error.message}`); }
});
el("memberEditorList").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-member-action]");
  if (!button) return;
  const row = button.closest("[data-member-id]");
  const memberId = row.dataset.memberId;
  const memberName = row.querySelector("input").value.trim();
  try {
    if (button.dataset.memberAction === "rename") {
      if (!memberName) throw new Error("名前を入力してください");
      await TeamSync.renameMember(memberId, memberName);
      showToast("メンバー名を変更しました");
    } else {
      await TeamSync.deleteMember(memberId);
      showToast("メンバーを削除しました");
    }
    renderMemberEditor();
  } catch (error) { showToast(`変更できませんでした: ${error.message}`); }
});
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeModal(); closeNameModal(); closeMemberModal(); } });
function updateShareModal(status) {
  el("shareOffline").hidden = status.enabled;
  el("createTeamForm").hidden = !status.needsCreate;
  el("joinTeamForm").hidden = !status.needsJoin;
  el("shareOnline").hidden = !status.online;
  if (status.online) el("inviteLinkInput").value = TeamSync.inviteLink();
}

async function initializeSharing() {
  try {
    const status = await TeamSync.init((shared) => {
      state.tasks = shared.tasks;
      state.names = shared.names;
      members = [{ id: "everyone", name: "全員", initial: "全", color: "everyone" }, ...shared.members];
      saveTasks();
      saveNames();
      render();
    });
    updateShareModal(status);
    if (status.needsJoin) openShareModal();
  } catch (error) {
    showToast(`共有接続エラー: ${error.message}`);
    updateShareModal({ enabled: false });
  }
}

function openShareModal() {
  el("shareModalBackdrop").hidden = false;
  updateShareModal({
    enabled: TeamSync.enabled,
    online: TeamSync.isOnline(),
    needsCreate: TeamSync.enabled && !TeamSync.isOnline() && !new URLSearchParams(location.search).get("invite"),
    needsJoin: TeamSync.enabled && !TeamSync.isOnline() && Boolean(new URLSearchParams(location.search).get("invite")),
  });
}

el("inviteButton").addEventListener("click", openShareModal);
el("closeShareModalButton").addEventListener("click", () => { el("shareModalBackdrop").hidden = true; });
el("shareModalBackdrop").addEventListener("click", (event) => { if (event.target === el("shareModalBackdrop")) el("shareModalBackdrop").hidden = true; });
el("createTeamForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await TeamSync.createTeam(el("ownerNameInput").value.trim(), state.names, state.tasks);
    updateShareModal({ enabled: true, online: true });
    showToast("共有チームを作成しました");
  } catch (error) { showToast(`作成できませんでした: ${error.message}`); }
});
el("joinTeamForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const invite = new URLSearchParams(location.search).get("invite");
    await TeamSync.joinTeam(invite, el("joinNameInput").value.trim());
    updateShareModal({ enabled: true, online: true });
    showToast("チームに参加しました");
  } catch (error) { showToast(`参加できませんでした: ${error.message}`); }
});
el("copyInviteButton").addEventListener("click", async () => {
  await navigator.clipboard.writeText(TeamSync.inviteLink());
  showToast("招待リンクをコピーしました");
});

el("todayLabel").textContent = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date());
render();
initializeSharing();
