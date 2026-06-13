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

const state = { todoFilter: "all", tasks: loadTasks(), names: loadNames(), calendarUrl: localStorage.getItem("minna-calendar-url") || "", editingName: "app" };
const el = (id) => document.getElementById(id);
let calendarMonth = new Date();

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
    tasks.forEach((task) => { if (task.type === "routine") { task.done = false; task.completedBy = []; } });
  }
  localStorage.setItem("minna-tasks", JSON.stringify({ tasks, routineResetKey: currentSaturday }));
  return tasks;
}

function saveTasks() {
  localStorage.setItem("minna-tasks", JSON.stringify({ tasks: state.tasks, routineResetKey: getSaturdayKey() }));
}

function normalizeTask(task, index = 0) {
  const assignees = task.assignees || (task.assignee && task.assignee !== "everyone" ? [task.assignee] : []);
  const completedBy = task.completedBy || (task.done && assignees.length ? [...assignees] : []);
  return { ...task, assignees, completedBy, order: task.order ?? index };
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
  const done = taskDone(task);
  if (state.todoFilter === "done") return done;
  if (state.todoFilter === "open") return !done;
  return !done || !isPastDue(task);
}

function taskDone(task) {
  return task.assignees.length ? task.assignees.every((id) => task.completedBy.includes(id)) : task.done;
}

function shortMemberName(name) {
  const compact = name.replace(/\s+/g, "");
  return compact.slice(0, 2);
}

function taskRow(task) {
  const assignedMembers = task.assignees.map((id) => members.find((item) => item.id === id)).filter(Boolean);
  const soon = task.due && task.due <= dateOffset(1);
  const routine = task.type === "routine";
  const done = taskDone(task);
  const completion = assignedMembers.length ? assignedMembers.map((member) => `<label class="completion-item">
    <input class="task-checkbox" type="checkbox" data-action="toggle-member" data-member-id="${member.id}" data-id="${task.id}" ${task.completedBy.includes(member.id) ? "checked" : ""}>
    <span class="completion-name avatar-${member.color}">${escapeHtml(shortMemberName(member.name))}</span>
  </label>`).join("") : `<label class="completion-item"><input class="task-checkbox" type="checkbox" data-action="toggle" data-id="${task.id}" ${task.done ? "checked" : ""}><span class="completion-name avatar-everyone">全員</span></label>`;
  return `<div class="task-row ${routine ? "routine-row" : "todo-row"} ${done ? "done" : ""}">
    <div class="task-main">
      <div class="completion-list">${completion}</div>
      <span class="task-name">${escapeHtml(task.name)}</span>
    </div>
    ${routine ? "" : `<div class="due ${soon && !done ? "soon" : ""}">${formatDue(task.due)}</div>`}
    <div class="order-buttons"><button class="order-button" data-action="up" data-id="${task.id}" title="上へ" aria-label="上へ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button><button class="order-button" data-action="down" data-id="${task.id}" title="下へ" aria-label="下へ"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div>
    <button class="delete-button" data-action="delete" data-id="${task.id}" aria-label="${escapeHtml(task.name)}を削除" title="削除">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></svg>
    </button>
  </div>`;
}

function render() {
  state.tasks = state.tasks.map(normalizeTask);
  const todos = state.tasks.filter(todoVisible).sort((a, b) => a.order - b.order);
  const routines = state.tasks.filter((task) => task.type === "routine").sort((a, b) => a.order - b.order);
  el("todoList").innerHTML = todos.map(taskRow).join("");
  el("routineList").innerHTML = routines.map(taskRow).join("");
  el("todoEmpty").hidden = todos.length > 0;
  el("routineEmpty").hidden = routines.length > 0;
  el("brandMark").textContent = state.names.mark;
  el("appName").textContent = state.names.app;
  el("taskAssignees").innerHTML = members.map((member) => `<label class="assignee-choice"><input type="checkbox" value="${member.id}" ${member.id === "everyone" ? "checked" : ""}>${escapeHtml(member.name)}</label>`).join("");
  renderCalendarEmbed();
  renderProgress();
}

function progressFor(tasks) {
  const done = tasks.filter(taskDone).length;
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
    const progress = progressFor(state.tasks.filter((task) => task.assignees.includes(member.id)));
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
  el("taskAssignees").querySelectorAll("input").forEach((input) => { input.checked = input.value === "everyone"; });
  el("modalTitle").textContent = type === "todo" ? "ToDoを追加" : "ルーティンを追加";
  el("datePicker").hidden = true;
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

function renderDatePicker() {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset);
  const selected = el("taskDue").value;
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = localDateKey(date);
    return `<button type="button" data-date="${key}" class="${date.getMonth() !== month ? "outside" : ""} ${key === selected ? "selected" : ""}">${date.getDate()}</button>`;
  }).join("");
  el("datePicker").innerHTML = `<div class="date-picker-header"><button type="button" data-calendar-move="-1">‹</button><strong>${year}年${month + 1}月</strong><button type="button" data-calendar-move="1">›</button></div><div class="date-picker-grid">${["月","火","水","木","金","土","日"].map((day) => `<span>${day}</span>`).join("")}${days}</div>`;
}

function renderCalendarEmbed() {
  const hasUrl = Boolean(state.calendarUrl);
  el("calendarEmpty").hidden = hasUrl;
  el("googleCalendarFrame").hidden = !hasUrl;
  if (hasUrl) {
    const url = new URL(state.calendarUrl);
    url.searchParams.set("mode", "WEEK");
    url.searchParams.set("showTitle", "0");
    url.searchParams.set("showCalendars", "0");
    url.searchParams.set("wkst", "2");
    if (el("googleCalendarFrame").src !== url.toString()) el("googleCalendarFrame").src = url.toString();
  }
}

function sortTodosByDue() {
  const todos = state.tasks.filter((task) => task.type === "todo").sort((a, b) => (a.due || "9999-12-31").localeCompare(b.due || "9999-12-31"));
  todos.forEach((task, index) => { task.order = index; syncTask(task); });
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
    task.completedBy = [];
    showToast(task.done ? "タスクを完了にしました" : "タスクを未完了に戻しました");
    syncTask(task);
  } else if (target.dataset.action === "toggle-member") {
    task.completedBy = target.checked ? [...new Set([...task.completedBy, target.dataset.memberId])] : task.completedBy.filter((id) => id !== target.dataset.memberId);
    task.done = taskDone(task);
    syncTask(task);
  } else if (target.dataset.action === "up" || target.dataset.action === "down") {
    const sameType = state.tasks.filter((item) => item.type === task.type).sort((a, b) => a.order - b.order);
    const index = sameType.findIndex((item) => item.id === task.id);
    const swapIndex = target.dataset.action === "up" ? index - 1 : index + 1;
    if (swapIndex >= 0 && swapIndex < sameType.length) {
      const other = sameType[swapIndex];
      [task.order, other.order] = [other.order, task.order];
      syncTask(task); syncTask(other);
    }
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
  const selected = [...el("taskAssignees").querySelectorAll("input:checked")].map((input) => input.value);
  const assignees = selected.includes("everyone") ? [] : selected;
  const maxOrder = Math.max(-1, ...state.tasks.filter((item) => item.type === type).map((item) => item.order ?? 0));
  const task = { id: Date.now(), name: el("taskName").value.trim(), assignees, completedBy: [], order: maxOrder + 1, due: type === "routine" ? "" : el("taskDue").value, type, done: false };
  state.tasks.unshift(task);
  if (type === "todo") sortTodosByDue();
  syncTask(task);
  saveTasks();
  closeModal();
  render();
  showToast("新しいタスクを追加しました");
  document.getElementById(`${type}Section`).scrollIntoView({ behavior: "smooth" });
});

el("taskAssignees").addEventListener("change", (event) => {
  const inputs = [...el("taskAssignees").querySelectorAll("input")];
  if (event.target.value === "everyone" && event.target.checked) inputs.forEach((input) => { if (input.value !== "everyone") input.checked = false; });
  if (event.target.value !== "everyone" && event.target.checked) inputs.find((input) => input.value === "everyone").checked = false;
  if (!inputs.some((input) => input.checked)) inputs.find((input) => input.value === "everyone").checked = true;
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

document.querySelectorAll("[data-add-type]").forEach((button) => button.addEventListener("click", () => openModal(button.dataset.addType)));
el("taskDue").addEventListener("click", () => { calendarMonth = new Date(`${el("taskDue").value || getNextWeekFriday()}T00:00:00`); renderDatePicker(); el("datePicker").hidden = false; });
el("datePicker").addEventListener("click", (event) => {
  const dateButton = event.target.closest("[data-date]");
  const moveButton = event.target.closest("[data-calendar-move]");
  if (dateButton) { el("taskDue").value = dateButton.dataset.date; el("datePicker").hidden = true; }
  if (moveButton) { calendarMonth.setMonth(calendarMonth.getMonth() + Number(moveButton.dataset.calendarMove)); renderDatePicker(); }
});
el("closeModalButton").addEventListener("click", closeModal);
el("modalBackdrop").addEventListener("click", (event) => { if (event.target === el("modalBackdrop")) closeModal(); });
el("closeNameModalButton").addEventListener("click", closeNameModal);
el("nameModalBackdrop").addEventListener("click", (event) => { if (event.target === el("nameModalBackdrop")) closeNameModal(); });
document.querySelectorAll("[data-edit-name]").forEach((button) => button.addEventListener("click", () => openNameModal(button.dataset.editName)));
el("editMembersButton").addEventListener("click", openMemberModal);
el("closeMemberModalButton").addEventListener("click", closeMemberModal);
el("memberModalBackdrop").addEventListener("click", (event) => { if (event.target === el("memberModalBackdrop")) closeMemberModal(); });
el("editCalendarButton").addEventListener("click", () => { el("calendarUrlInput").value = state.calendarUrl; el("calendarModalBackdrop").hidden = false; });
el("closeCalendarModalButton").addEventListener("click", () => { el("calendarModalBackdrop").hidden = true; });
el("calendarModalBackdrop").addEventListener("click", (event) => { if (event.target === el("calendarModalBackdrop")) el("calendarModalBackdrop").hidden = true; });
el("calendarForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const calendarUrl = el("calendarUrlInput").value.trim();
  if (calendarUrl && !calendarUrl.startsWith("https://calendar.google.com/calendar/embed")) {
    showToast("Googleカレンダーの埋め込みURLを入力してください");
    return;
  }
  state.calendarUrl = calendarUrl;
  localStorage.setItem("minna-calendar-url", state.calendarUrl);
  await TeamSync.updateCalendar(state.calendarUrl).catch((error) => showToast(`カレンダーを同期できませんでした: ${error.message}`));
  el("calendarModalBackdrop").hidden = true;
  renderCalendarEmbed();
  showToast("Googleカレンダーを設定しました");
});
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
  el("shareOnline").hidden = !status.online;
  if (status.online) el("inviteLinkInput").value = TeamSync.inviteLink();
}

async function initializeSharing() {
  try {
    const status = await TeamSync.init((shared) => {
      state.tasks = shared.tasks;
      state.names = shared.names;
      state.calendarUrl = shared.calendarUrl || "";
      localStorage.setItem("minna-calendar-url", state.calendarUrl);
      members = [{ id: "everyone", name: "全員", initial: "全", color: "everyone" }, ...shared.members];
      saveTasks();
      saveNames();
      render();
    });
    updateShareModal(status);
  } catch (error) {
    showToast(`共有接続エラー: ${error.message}`);
    updateShareModal({ enabled: false });
  }
}

function openShareModal() {
  el("shareModalBackdrop").hidden = false;
  const joinCode = TeamSync.joinCode();
  updateShareModal({
    enabled: TeamSync.enabled,
    online: TeamSync.isOnline(),
    needsCreate: TeamSync.enabled && !TeamSync.isOnline() && !joinCode,
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
el("copyInviteButton").addEventListener("click", async () => {
  const link = TeamSync.inviteLink();
  el("inviteLinkInput").value = link;
  await navigator.clipboard.writeText(link);
  showToast("共有URLをコピーしました");
});

render();
initializeSharing();
