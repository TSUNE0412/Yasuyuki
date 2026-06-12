window.TeamSync = (() => {
  const config = window.MINNA_CONFIG || {};
  const enabled = Boolean(config.supabaseUrl && config.supabaseKey && window.supabase);
  const client = enabled ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;
  let team = null;
  let user = null;
  let channel = null;
  let onChange = null;

  async function init(callback) {
    onChange = callback;
    if (!enabled) return { enabled: false };
    const { data, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    user = data.user;
    const inviteCode = new URLSearchParams(location.search).get("invite");
    const savedTeam = localStorage.getItem("minna-team-id");
    if (inviteCode && inviteCode !== localStorage.getItem("minna-invite-code")) return { enabled: true, needsJoin: true, inviteCode };
    if (!savedTeam) return { enabled: true, needsCreate: true };
    team = { id: savedTeam, invite_code: localStorage.getItem("minna-invite-code") };
    try {
      await subscribe();
      await refresh();
    } catch (error) {
      if (!team.invite_code) throw error;
      team = null;
      return { enabled: true, needsJoin: true, inviteCode: localStorage.getItem("minna-invite-code"), reconnect: true };
    }
    return { enabled: true, online: true, team };
  }

  async function createTeam(name, appNames, localTasks) {
    const { data, error } = await client.rpc("create_minna_team", {
      team_name: appNames.team,
      member_name: name,
      app_name: appNames.app,
      app_mark: appNames.mark,
    });
    if (error) throw error;
    rememberTeam(data);
    await Promise.all(localTasks.map((task) => upsertTask({ ...task, assignee: "everyone" })));
    await subscribe();
    await refresh();
    return team;
  }

  async function joinTeam(inviteCode, name) {
    const { data, error } = await client.rpc("join_minna_team", { invite: inviteCode, member_name: name });
    if (error) throw error;
    rememberTeam(data);
    history.replaceState({}, "", location.pathname);
    await subscribe();
    await refresh();
    return team;
  }

  function rememberTeam(data) {
    team = Array.isArray(data) ? data[0] : data;
    localStorage.setItem("minna-team-id", team.id);
    localStorage.setItem("minna-invite-code", team.invite_code);
  }

  async function refresh() {
    if (!team) return;
    const [{ data: taskRows, error: taskError }, { data: memberRows, error: memberError }, { data: teamRow, error: teamError }] = await Promise.all([
      client.from("minna_tasks").select("*").eq("team_id", team.id).order("created_at", { ascending: false }),
      client.from("minna_members").select("*").eq("team_id", team.id).order("joined_at"),
      client.from("minna_teams").select("*").eq("id", team.id).single(),
    ]);
    if (taskError || memberError || teamError) throw taskError || memberError || teamError;
    onChange?.({
      tasks: taskRows.map((row) => ({ id: row.id, name: row.name, assignee: row.assigned_to || "everyone", due: row.due_date || "", type: row.task_type, done: row.done })),
      members: memberRows.map((row, index) => ({ id: row.member_id || row.user_id, name: row.display_name, initial: row.display_name.slice(0, 1), color: ["blue", "pink", "yellow", "purple"][index % 4] })),
      names: { mark: teamRow.app_mark, app: teamRow.app_name, team: teamRow.name },
    });
  }

  async function subscribe() {
    if (channel) await client.removeChannel(channel);
    channel = client.channel(`minna-${team.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "minna_tasks", filter: `team_id=eq.${team.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "minna_members", filter: `team_id=eq.${team.id}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "minna_teams", filter: `id=eq.${team.id}` }, refresh)
      .subscribe();
  }

  async function upsertTask(task) {
    if (!team) return;
    const row = { id: Number(task.id), team_id: team.id, name: task.name, assigned_to: task.assignee === "everyone" ? null : task.assignee, due_date: task.due || null, task_type: task.type, done: task.done };
    const { error } = await client.from("minna_tasks").upsert(row);
    if (error) throw error;
  }

  async function deleteTask(id) {
    if (!team) return;
    const { error } = await client.from("minna_tasks").delete().eq("id", id).eq("team_id", team.id);
    if (error) throw error;
  }

  async function updateNames(names) {
    if (!team) return;
    const { error } = await client.from("minna_teams").update({ name: names.team, app_name: names.app, app_mark: names.mark }).eq("id", team.id);
    if (error) throw error;
  }

  async function addMember(name) {
    if (!team) throw new Error("先に共有チームへ接続してください");
    const { error } = await client.rpc("add_minna_member", { target_team: team.id, member_name: name });
    if (error) throw error;
    await refresh();
  }

  async function renameMember(memberId, name) {
    if (!team) throw new Error("先に共有チームへ接続してください");
    const { error } = await client.rpc("rename_minna_member", { target_team: team.id, target_member: memberId, member_name: name });
    if (error) throw error;
    await refresh();
  }

  async function deleteMember(memberId) {
    if (!team) throw new Error("先に共有チームへ接続してください");
    const { error } = await client.rpc("delete_minna_member", { target_team: team.id, target_member: memberId });
    if (error) throw error;
    await refresh();
  }

  function inviteLink() {
    return team ? `${location.origin}${location.pathname}?invite=${team.invite_code}` : "";
  }

  function joinCode() {
    return new URLSearchParams(location.search).get("invite") || localStorage.getItem("minna-invite-code");
  }

  return { enabled, init, createTeam, joinTeam, upsertTask, deleteTask, updateNames, addMember, renameMember, deleteMember, inviteLink, joinCode, isOnline: () => Boolean(team), refresh };
})();
