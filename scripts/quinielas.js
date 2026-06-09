import { MATCHES } from "./matches-data.js";
import {
  deleteQuinielaCloud,
  loadQuinielasByEmail,
  mergeCloudQuinielas,
  saveQuinielaCloud,
  sendQuinielaCloud,
  validateAccessCode,
} from "./firebase-service.js";

const LIST_KEY = "quinielaMalenka.saved";
const PROFILE_KEY = "quinielaMalenka.user";
const TOTAL_MATCHES = MATCHES.length;
const GROUP_NAMES = [...new Set(MATCHES.map((match) => match.group))];
const TOTAL_GROUPS = GROUP_NAMES.length;

let selectedTab = "all";
let selectedId = null;
let currentView = "list";
let editingId = null;

function createEmptyResults() {
  return Object.fromEntries(
    MATCHES.map((match) => [match.id, { homeScore: "", awayScore: "" }]),
  );
}

function createEmptyWinners() {
  return {};
}

const seed = [
  {
    id: crypto.randomUUID(),
    quinielaName: "Tatul 👑",
    propietarioName: "Raúl García",
    userEmail: "raulgarlem@gmail.com",
    quinielaCode: "",
    isSent: true,
    isFavorite: true,
    resultsJson: JSON.stringify(createEmptyResults()),
    winnersJson: JSON.stringify(createEmptyWinners()),
    points: 0,
  },
  {
    id: crypto.randomUUID(),
    quinielaName: "Quiniela familiar",
    propietarioName: "Malenka",
    userEmail: "familia@email.com",
    quinielaCode: "",
    isSent: false,
    isFavorite: false,
    resultsJson: JSON.stringify({
      ...createEmptyResults(),
      A1: { homeScore: "2", awayScore: "1" },
    }),
    winnersJson: '{"Grupo A":"México"}',
    points: null,
  },
  {
    id: crypto.randomUUID(),
    quinielaName: "Borrador mundialista",
    propietarioName: "Invitado",
    userEmail: "",
    quinielaCode: "",
    isSent: false,
    isFavorite: false,
    resultsJson: JSON.stringify(createEmptyResults()),
    winnersJson: JSON.stringify(createEmptyWinners()),
    points: null,
  },
];

const $ = (id) => document.getElementById(id);
const pageEl = document.querySelector(".qm-page");
const optionsDialog = $("optionsDialog");
const deleteDialog = $("deleteDialog");
const serverDeleteDialog = $("serverDeleteDialog");
const emailDialog = $("emailDialog");

function getQuinielas() {
  try {
    return JSON.parse(localStorage.getItem(LIST_KEY) || "null") || seed;
  } catch {
    return seed;
  }
}
function saveQuinielas(items) {
  localStorage.setItem(LIST_KEY, JSON.stringify(items));
}
function getProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY) || "{}");
  } catch {
    return {};
  }
}
function showToast(text) {
  const t = $("toast");
  if (!t) return;
  t.textContent = text;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2400);
}
function parseObj(json) {
  try {
    return JSON.parse(json || "{}");
  } catch {
    return {};
  }
}
function escapeHtml(str) {
  return String(str).replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
}
function sanitizeNumber(value) {
  return String(value ?? "")
    .replace(/\D/g, "")
    .slice(0, 2);
}

function isComplete(q) {
  const results = parseObj(q.resultsJson);
  const winners = parseObj(q.winnersJson);
  const matchesDone = MATCHES.filter(
    (m) => results[m.id]?.homeScore !== "" && results[m.id]?.awayScore !== "",
  ).length;
  const winnersDone = GROUP_NAMES.filter((g) => winners[g]).length;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.userEmail || "");
  return (
    matchesDone >= TOTAL_MATCHES && winnersDone >= TOTAL_GROUPS && emailValid
  );
}
function statusOf(q) {
  if (q.isSent) return { text: "Enviada", cls: "sent" };
  if (isComplete(q)) return { text: "Completa", cls: "complete" };
  return { text: "Borrador", cls: "draft" };
}
function filtered(items) {
  if (selectedTab === "created") return items.filter((q) => !q.isSent);
  if (selectedTab === "sent") return items.filter((q) => q.isSent);
  return items;
}

function render() {
  if (currentView === "editor" && editingId) return renderEditor(editingId);
  renderList();
}

function renderList() {
  currentView = "list";
  editingId = null;
  const items = filtered(getQuinielas()).sort(
    (a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0),
  );
  pageEl.innerHTML = `<header class="qm-header">
      <div>
        <h1>MIS QUINIELAS</h1>
        <p>Crea, gestiona y envía tus quinielas</p>
      </div>
      <div class="header-trophy">🏆</div>
    </header>

    <section class="tabs" aria-label="Filtros de quinielas">
      <button class="tab ${selectedTab === "all" ? "active" : ""}" data-tab="all">Mis Quinielas</button>
      <button class="tab ${selectedTab === "created" ? "active" : ""}" data-tab="created">Creadas</button>
      <button class="tab ${selectedTab === "sent" ? "active" : ""}" data-tab="sent">Enviadas</button>
    </section>

    <button id="cloudLoadBtn" class="cloud-btn" type="button">☁️ Cargar mis quinielas (Cloud)</button>

    <section id="quinielasList" class="quinielas-list">
      ${items.map((q) => renderQuinielaCard(q)).join("")}
      <button class="create-card" id="createCard" type="button"><span style="font-size:1.7rem">＋</span><div><b>Crear nueva quiniela</b><span>Comienza a hacer tus pronósticos</span></div></button>
    </section>`;
  bindListEvents();
}

function renderQuinielaCard(q) {
  const st = statusOf(q);
  const owner = q.propietarioName || "Anónimo";
  const email = q.userEmail || "Sin correo";
  const points = q.isSent ? `${q.points ?? 0} puntos` : "Sin enviar";
  return `<article class="q-card" data-id="${q.id}">
    <div class="q-main">
      <h2>${escapeHtml(q.quinielaName || "Sin nombre")}</h2>
      <div class="meta">Propietario: ${escapeHtml(owner)}<br>${escapeHtml(email)}</div>
      <div class="status-row"><span class="badge ${st.cls}">${st.text}</span><span class="points">${points}</span></div>
    </div>
    <div class="card-actions">
      <button class="star ${q.isFavorite ? "active" : ""}" data-action="favorite" aria-label="Favorita">${q.isFavorite ? "★" : "☆"}</button>
      <button class="arrow" data-action="options" aria-label="Opciones">›</button>
    </div>
  </article>`;
}

function bindListEvents() {
  document.querySelectorAll(".tab").forEach((btn) =>
    btn.addEventListener("click", () => {
      selectedTab = btn.dataset.tab;
      renderList();
    }),
  );

  $("cloudLoadBtn")?.addEventListener("click", () => {
    const p = getProfile();
    $("cloudEmail").value = p.email || "";
    emailDialog.showModal();
  });

  document.querySelectorAll(".q-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      const action = e.target.dataset.action;
      selectedId = card.dataset.id;
      if (action === "favorite") return toggleFavorite(selectedId);
      if (action === "options") return openOptions(selectedId);
      openEditor(selectedId);
    });
    card.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      selectedId = card.dataset.id;
      openOptions(selectedId);
    });
  });

  $("createCard")?.addEventListener("click", createNew);
}

function openEditor(id) {
  editingId = id;
  currentView = "editor";
  renderEditor(id);
}

function createNew() {
  const profile = getProfile();
  const items = getQuinielas();
  const baseName = "Nueva Quiniela";
  let n = 1;
  let name = baseName;
  while (items.some((q) => q.quinielaName === name)) {
    n++;
    name = `${baseName} (${n})`;
  }

  const newQuiniela = {
    id: crypto.randomUUID(),
    quinielaName: name,
    propietarioName: profile.name || "",
    userEmail: profile.email || "",
    quinielaCode: profile.accessCode || "",
    isSent: false,
    isFavorite: false,
    resultsJson: JSON.stringify(createEmptyResults()),
    winnersJson: JSON.stringify(createEmptyWinners()),
    points: null,
  };

  items.push(newQuiniela);
  saveQuinielas(items);
  selectedTab = "all";
  showToast("Nueva quiniela creada");
  openEditor(newQuiniela.id);
}

function renderEditor(id) {
  const q = getQuinielas().find((x) => x.id === id);
  if (!q) {
    currentView = "list";
    return renderList();
  }

  const results = { ...createEmptyResults(), ...parseObj(q.resultsJson) };
  const winners = parseObj(q.winnersJson);
  const groups = Object.groupBy
    ? Object.groupBy(MATCHES, (m) => m.group)
    : groupBy(MATCHES, "group");

  pageEl.innerHTML = `<header class="editor-header">
      <button id="backToListBtn" class="back-btn" type="button">‹</button>
      <div>
        <h1>LLENAR QUINIELA</h1>
        <p>${escapeHtml(q.quinielaName || "Nueva Quiniela")}</p>
      </div>
    </header>

    <section class="editor-panel">
      <label>Nombre de la quiniela<input id="editQuinielaName" type="text" value="${escapeHtml(q.quinielaName || "")}" /></label>
      <label>Propietario<input id="editOwner" type="text" value="${escapeHtml(q.propietarioName || "")}" /></label>
      <label>Correo electrónico<input id="editEmail" type="email" value="${escapeHtml(q.userEmail || "")}" /></label>
      <label>Código de acceso<input id="editAccessCode" type="password" autocomplete="off" value="${escapeHtml(q.quinielaCode || getProfile().accessCode || "")}" /></label>
    </section>

    <section class="editor-actions-top">
      <button id="saveEditorTopBtn" class="secondary full" type="button">Guardar cambios</button>
      <button id="saveCloudEditorBtn" class="cloud-btn full" type="button">Guardar copia en Cloud</button>
      <button id="clearEditorBtn" class="ghost full" type="button">Borrar marcadores</button>
    </section>

    <section class="groups-editor">
      ${GROUP_NAMES.map((groupName) => renderGroupEditor(groupName, groups[groupName] || [], results, winners)).join("")}
    </section>

    <footer class="editor-bottom-bar">
      <button id="saveEditorBtn" class="secondary" type="button">Guardar</button>
      <button id="sendEditorBtn" class="danger-btn" type="button" ${q.isSent ? "disabled" : ""}>${q.isSent ? "Enviada ✓" : "Enviar"}</button>
    </footer>`;

  bindEditorEvents(id);
}

function groupBy(list, key) {
  return list.reduce((acc, item) => {
    (acc[item[key]] ||= []).push(item);
    return acc;
  }, {});
}

function getTeams(matches) {
  const map = new Map();
  matches.forEach((m) => {
    map.set(m.homeTeam, m.homeFlag);
    map.set(m.awayTeam, m.awayFlag);
  });
  return [...map.entries()].map(([team, flag]) => ({ team, flag }));
}

function renderGroupEditor(groupName, matches, results, winners) {
  const teams = getTeams(matches);
  const options =
    `<option value="">Seleccionar ganador</option>` +
    teams
      .map(
        (t) =>
          `<option value="${escapeHtml(t.team)}" ${winners[groupName] === t.team ? "selected" : ""}>${t.flag} ${escapeHtml(t.team)}</option>`,
      )
      .join("");

  return `<article class="group-card-editor">
    <button class="group-title" type="button" data-group-toggle>${escapeHtml(groupName)} <span>⌄</span></button>
    <div class="group-body">
      <label class="winner-box">¿Quién quedará en 1º del grupo?
        <select data-winner-group="${escapeHtml(groupName)}">${options}</select>
      </label>
      ${matches.map((match) => renderMatchEditor(match, results[match.id] || { homeScore: "", awayScore: "" })).join("")}
    </div>
  </article>`;
}

function renderMatchEditor(match, result) {
  return `<article class="match-editor" data-match-id="${match.id}">
    <div class="match-date">${escapeHtml(match.group)} • ${formatDate(match.date)} • ${escapeHtml(match.time)} hrs</div>
    <div class="match-row-editor">
      <div class="team-editor"><span>${match.homeFlag}</span><b>${escapeHtml(match.homeTeam)}</b></div>
      <div class="score-editor">
        <input data-score="home" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${escapeHtml(result.homeScore ?? "")}" />
        <span>-</span>
        <input data-score="away" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${escapeHtml(result.awayScore ?? "")}" />
      </div>
      <div class="team-editor away"><b>${escapeHtml(match.awayTeam)}</b><span>${match.awayFlag}</span></div>
    </div>
  </article>`;
}

function formatDate(date) {
  const [year, month, day] = date.split("-");
  const months = { "06": "Junio", "07": "Julio" };
  return `${Number(day)} de ${months[month] || month}`;
}

function collectEditorData(id) {
  const q = getQuinielas().find((x) => x.id === id);
  const results = { ...createEmptyResults(), ...parseObj(q?.resultsJson) };
  const winners = parseObj(q?.winnersJson);

  document.querySelectorAll(".match-editor").forEach((card) => {
    const matchId = card.dataset.matchId;
    const home = sanitizeNumber(
      card.querySelector('[data-score="home"]')?.value,
    );
    const away = sanitizeNumber(
      card.querySelector('[data-score="away"]')?.value,
    );
    results[matchId] = { homeScore: home, awayScore: away };
  });

  document.querySelectorAll("[data-winner-group]").forEach((select) => {
    const group = select.dataset.winnerGroup;
    if (select.value) winners[group] = select.value;
    else delete winners[group];
  });

  return {
    quinielaName: $("editQuinielaName")?.value.trim() || "Sin nombre",
    propietarioName: $("editOwner")?.value.trim() || "",
    userEmail: $("editEmail")?.value.trim() || "",
    quinielaCode:
      $("editAccessCode")?.value.trim() ||
      getProfile().accessCode ||
      "",
    results,
    winners,
  };
}

function saveEditor(id, silent = false) {
  const items = getQuinielas();
  const index = items.findIndex((q) => q.id === id);
  if (index < 0) return;
  const data = collectEditorData(id);
  items[index] = {
    ...items[index],
    quinielaName: data.quinielaName,
    propietarioName: data.propietarioName,
    userEmail: data.userEmail,
    quinielaCode: data.quinielaCode,
    resultsJson: JSON.stringify(data.results),
    winnersJson: JSON.stringify(data.winners),
  };
  saveQuinielas(items);
  if (!silent) showToast("Quiniela guardada");
}

function clearEditorScores(id) {
  document
    .querySelectorAll("[data-score]")
    .forEach((input) => (input.value = ""));
  document
    .querySelectorAll("[data-winner-group]")
    .forEach((select) => (select.value = ""));
  saveEditor(id, true);
  showToast("Marcadores borrados");
}

async function saveEditorCloud(id) {
  saveEditor(id, true);
  const items = getQuinielas();
  const q = items.find((item) => item.id === id);
  if (!q) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.userEmail || "")) {
    return showToast("Ingresa un correo válido");
  }

  const button = $("saveCloudEditorBtn");
  if (button) button.disabled = true;
  try {
    const cloud = await saveQuinielaCloud(q);
    q.cloudMapKey = cloud.mapKey;
    saveQuinielas(items);
    showToast("Quiniela guardada en Cloud");
  } catch (error) {
    showToast(error.message || "No se pudo guardar en Cloud");
  } finally {
    if (button) button.disabled = false;
  }
}

async function sendEditor(id) {
  saveEditor(id, true);
  const items = getQuinielas();
  const q = items.find((x) => x.id === id);
  if (!q) return;

  const data = collectEditorData(id);
  const matchesComplete = MATCHES.every(
    (m) =>
      data.results[m.id]?.homeScore !== "" &&
      data.results[m.id]?.awayScore !== "",
  );
  const winnersComplete = GROUP_NAMES.every((g) => data.winners[g]);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.userEmail || "");

  if (!emailValid) return showToast("Ingresa un correo válido");
  if (!matchesComplete && !winnersComplete)
    return showToast("Llena todos los marcadores y ganadores");
  if (!matchesComplete) return showToast("Llena todos los marcadores");
  if (!winnersComplete) return showToast("Elige ganador de cada grupo");

  const button = $("sendEditorBtn");
  if (button) button.disabled = true;
  try {
    const codeResult = await validateAccessCode(data.quinielaCode);
    if (!codeResult.ok) return showToast(codeResult.message);

    const cloud = await sendQuinielaCloud({
      ...q,
      ...data,
      resultsJson: JSON.stringify(data.results),
      winnersJson: JSON.stringify(data.winners),
    });
    q.isSent = true;
    q.points = q.points ?? 0;
    q.cloudId = cloud.documentId;
    q.quinielaCode = data.quinielaCode;
    saveQuinielas(items);
    renderEditor(id);
    showToast(
      cloud.webhookDelivered
        ? "Quiniela enviada correctamente"
        : "Quiniela registrada; notificación pendiente",
    );
  } catch (error) {
    showToast(error.message || "No se pudo enviar la quiniela");
  } finally {
    if (button?.isConnected) button.disabled = false;
  }
}

function bindEditorEvents(id) {
  $("backToListBtn")?.addEventListener("click", () => {
    saveEditor(id, true);
    currentView = "list";
    renderList();
  });
  $("saveEditorTopBtn")?.addEventListener("click", () => saveEditor(id));
  $("saveCloudEditorBtn")?.addEventListener("click", () =>
    saveEditorCloud(id),
  );
  $("saveEditorBtn")?.addEventListener("click", () => saveEditor(id));
  $("clearEditorBtn")?.addEventListener("click", () => clearEditorScores(id));
  $("sendEditorBtn")?.addEventListener("click", () => sendEditor(id));

  document.querySelectorAll("[data-score]").forEach((input) => {
    input.addEventListener("input", () => {
      input.value = sanitizeNumber(input.value);
    });
    input.addEventListener("change", () => saveEditor(id, true));
  });

  document.querySelectorAll("[data-winner-group]").forEach((select) => {
    select.addEventListener("change", () => saveEditor(id, true));
  });

  document.querySelectorAll("[data-group-toggle]").forEach((btn) => {
    btn.addEventListener("click", () =>
      btn.closest(".group-card-editor")?.classList.toggle("collapsed"),
    );
  });
}

function toggleFavorite(id) {
  const items = getQuinielas();
  const q = items.find((x) => x.id === id);
  if (q) q.isFavorite = !q.isFavorite;
  saveQuinielas(items);
  renderList();
}
function openOptions(id) {
  const q = getQuinielas().find((x) => x.id === id);
  if (!q) return;
  $("sheetTitle").textContent = q.quinielaName || "Sin nombre";
  optionsDialog.showModal();
}
function duplicateSelected() {
  const items = getQuinielas();
  const q = items.find((x) => x.id === selectedId);
  if (!q) return;
  const base = (q.quinielaName || "Sin nombre").replace(/ \(\d+\)$/, " ");
  let n = 1,
    name = `${base.trim()} (${n})`;
  while (
    items.some(
      (x) => x.quinielaName === name && x.propietarioName === q.propietarioName,
    )
  ) {
    n++;
    name = `${base.trim()} (${n})`;
  }
  items.push({
    ...q,
    id: crypto.randomUUID(),
    quinielaName: name,
    isSent: false,
    isFavorite: false,
  });
  saveQuinielas(items);
  optionsDialog.close();
  renderList();
  showToast("Quiniela duplicada");
}
function deleteLocal() {
  saveQuinielas(getQuinielas().filter((q) => q.id !== selectedId));
  deleteDialog.close();
  renderList();
  showToast("Quiniela eliminada del dispositivo");
}

$("fabBtn")?.addEventListener("click", createNew);
$("cancelCloudBtn")?.addEventListener("click", () => emailDialog.close());
$("searchCloudBtn")?.addEventListener("click", async () => {
  const email = $("cloudEmail").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showToast("Ingresa un correo válido");
  }
  const button = $("searchCloudBtn");
  button.disabled = true;
  try {
    const cloudItems = await loadQuinielasByEmail(email);
    saveQuinielas(mergeCloudQuinielas(getQuinielas(), cloudItems));
    emailDialog.close();
    renderList();
    showToast(
      cloudItems.length
        ? `${cloudItems.length} quiniela(s) cargada(s)`
        : "No se encontraron quinielas",
    );
  } catch (error) {
    showToast(error.message || "No se pudo consultar Firestore");
  } finally {
    button.disabled = false;
  }
});
$("closeSheetBtn")?.addEventListener("click", () => optionsDialog.close());
$("duplicateBtn")?.addEventListener("click", duplicateSelected);
$("deleteBtn")?.addEventListener("click", () => {
  optionsDialog.close();
  deleteDialog.showModal();
});
$("cancelDeleteBtn")?.addEventListener("click", () => deleteDialog.close());
$("deleteLocalBtn")?.addEventListener("click", deleteLocal);
$("deleteServerBtn")?.addEventListener("click", () => {
  deleteDialog.close();
  const q = getQuinielas().find((x) => x.id === selectedId);
  $("serverUser").value = (q?.userEmail || "")
    .toLowerCase()
    .replace("@", "_")
    .replaceAll(".", "_");
  serverDeleteDialog.showModal();
});
$("cancelServerDeleteBtn")?.addEventListener("click", () =>
  serverDeleteDialog.close(),
);
$("confirmServerDeleteBtn")?.addEventListener("click", async () => {
  const q = getQuinielas().find((item) => item.id === selectedId);
  if (!q) return;
  const button = $("confirmServerDeleteBtn");
  button.disabled = true;
  try {
    await deleteQuinielaCloud(
      q,
      $("serverUser").value.trim(),
      $("serverPass").value,
    );
    serverDeleteDialog.close();
    deleteLocal();
    showToast("Quiniela eliminada de Cloud y del dispositivo");
  } catch (error) {
    showToast(error.message || "No se pudo eliminar de Firestore");
  } finally {
    button.disabled = false;
  }
});

if (!localStorage.getItem(LIST_KEY)) saveQuinielas(seed);
renderList();
