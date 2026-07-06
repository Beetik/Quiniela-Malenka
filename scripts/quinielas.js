import { MATCHES } from "./matches-data.js";
import {
  deleteQuinielaCloud,
  loadAppConfig,
  loadQuinielasByEmail,
  mergeCloudQuinielas,
  observeMatches,
  saveQuinielaCloud,
  sendQuinielaCloud,
  validateAccessCode,
} from "./firebase-service.js";
import { syncUserAchievements } from "./achievements-sync.js";
import { regularTimeScore } from "./match-score-utils.js";
import { teamFlagEmailEmoji, teamFlagEmoji, teamFlagMarkup } from "./team-flags.js";
import { formatLocalMatchDate, formatLocalMatchTime, matchTimestamp } from "./timezone-utils.js";

const LIST_KEY = "quinielaMalenka.saved";
const PROFILE_KEY = "quinielaMalenka.user";
const APP_CONFIG_CACHE_KEY = "quinielaMalenka.appConfig";
const KNOCKOUT_GROUPS = [
  "16avos de Final",
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinales",
  "Tercer Lugar",
  "Final",
];
const KNOCKOUT_WINNER_POINTS = {
  Final: 5,
  "Tercer Lugar": 8,
};
function groupMatches() {
  return currentMatches.filter((match) => match.group.startsWith("Grupo"));
}

function knockoutMatches() {
  return currentMatches.filter((match) => KNOCKOUT_GROUPS.includes(match.group));
}

function groupNames() {
  return [...new Set(groupMatches().map((match) => match.group))];
}

let selectedTab = "all";
let selectedPhase = "all";
let selectedId = null;
let currentView = "list";
let editingId = null;
let currentMatches = MATCHES;
let appConfig = readCachedAppConfig();

function createEmptyResults(matches = MATCHES) {
  return Object.fromEntries(
    matches.map((match) => [match.id, { homeScore: "", awayScore: "" }]),
  );
}

function createEmptyWinners() {
  return {};
}

function normalizeKnockoutWinners(winners = {}) {
  return {
    Final: winners.Final || "",
    "Tercer Lugar": winners["Tercer Lugar"] || "",
  };
}

function knockoutWinnerPointValue(roundName) {
  return KNOCKOUT_WINNER_POINTS[roundName] || 0;
}

const $ = (id) => document.getElementById(id);
const pageEl = document.querySelector(".qm-page");
const optionsDialog = $("optionsDialog");
const createPhaseDialog = $("createPhaseDialog");
const deleteDialog = $("deleteDialog");
const serverDeleteDialog = $("serverDeleteDialog");
const emailDialog = $("emailDialog");

function getQuinielas() {
  try {
    const stored = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        (String(item.quinielaName || "").trim() ||
          String(item.propietarioName || "").trim()),
    );
  } catch {
    return [];
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
async function syncAchievementsAfterChange() {
  const profile = getProfile();
  if (!profile?.email) return;
  try {
    await syncUserAchievements({
      userEmail: profile.email,
      quinielas: getQuinielas(),
      matches: currentMatches,
    });
  } catch (error) {
    console.error("No fue posible actualizar los logros:", error);
  }
}

async function refreshAppConfig() {
  try {
    appConfig = normalizeAppConfig(await loadAppConfig());
    localStorage.setItem(APP_CONFIG_CACHE_KEY, JSON.stringify(appConfig));
    render();
  } catch {
    appConfig = readCachedAppConfig();
    syncCreationControls();
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

function normalizeAppConfig(config = {}) {
  return {
    faseGrupos: Boolean(config?.faseGrupos ?? true),
    faseFinal: Boolean(config?.faseFinal ?? true),
    visibleGroups: Boolean(config?.visibleGroups ?? true),
    visibleFinal: Boolean(config?.visibleFinal ?? false),
  };
}

function readCachedAppConfig() {
  return normalizeAppConfig(parseObj(localStorage.getItem(APP_CONFIG_CACHE_KEY)));
}

function editablePhases() {
  return [
    appConfig.faseGrupos ? { key: "groups", isKnockout: false, title: "Crear fase de grupos", subtitle: "Marcadores y ganadores de grupo" } : null,
    appConfig.faseFinal ? { key: "knockout", isKnockout: true, title: "Crear eliminatorias", subtitle: "Finales, campeón y tercer lugar" } : null,
  ].filter(Boolean);
}

function isPhaseEditable(isKnockout) {
  return isKnockout ? appConfig.faseFinal : appConfig.faseGrupos;
}

function syncSelectedPhaseWithEditablePhases() {
  const options = editablePhases();
  if (options.length === 1 && selectedPhase === "all") selectedPhase = options[0].key;
  if (selectedPhase === "groups" && !appConfig.faseGrupos && appConfig.faseFinal) selectedPhase = "knockout";
  if (selectedPhase === "knockout" && !appConfig.faseFinal && appConfig.faseGrupos) selectedPhase = "groups";
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

function isIncompleteResult(result) {
  if (!result) return false;
  return (
    (result.homeScore === "" && result.awayScore !== "") ||
    (result.homeScore !== "" && result.awayScore === "")
  );
}

function matchWinner(match) {
  const score = match?.finished ? regularTimeScore(match) : null;
  if (!score) return null;
  const [home, away] = score;
  if (home > away) return match.homeTeam;
  if (away > home) return match.awayTeam;
  return null;
}

function isComplete(q) {
  const results = parseObj(q.resultsJson);
  const winners = parseObj(q.winnersJson);
  if (q.isKnockout) {
    const hasIncomplete = knockoutMatches().some((m) => isIncompleteResult(results[m.id]));
    const hasAny =
      knockoutMatches().some(
        (m) => results[m.id]?.homeScore !== "" && results[m.id]?.awayScore !== "",
      ) ||
      winners.Final ||
      winners["Tercer Lugar"];
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.userEmail || "");
    return Boolean(hasAny && !hasIncomplete && emailValid);
  }
  const matchesDone = groupMatches().filter(
    (m) => results[m.id]?.homeScore !== "" && results[m.id]?.awayScore !== "",
  ).length;
  const groups = groupNames();
  const winnersDone = groups.filter((g) => winners[g]).length;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.userEmail || "");
  return (
    matchesDone >= groupMatches().length && winnersDone >= groups.length && emailValid
  );
}
function statusOf(q) {
  if (q.isSent) return { text: "Enviada", cls: "sent" };
  if (isComplete(q)) return { text: "Completa", cls: "complete" };
  return { text: "Borrador", cls: "draft" };
}

function calculateRealGroupWinners(matches) {
  const groups = groupBy(matches, "group");
  return Object.fromEntries(
    Object.entries(groups).map(([groupName, groupMatches]) => {
      if (!groupMatches.every((match) => match.finished)) return [groupName, null];
      const finished = groupMatches.filter(
        (match) => regularTimeScore(match) != null,
      );
      if (!finished.length) return [groupName, null];

      const table = {};
      const goals = {};
      finished.forEach((match) => {
        const [home, away] = regularTimeScore(match);
        goals[match.homeTeam] = (goals[match.homeTeam] || 0) + home;
        goals[match.awayTeam] = (goals[match.awayTeam] || 0) + away;
        if (home > away) table[match.homeTeam] = (table[match.homeTeam] || 0) + 3;
        else if (home < away) table[match.awayTeam] = (table[match.awayTeam] || 0) + 3;
        else {
          table[match.homeTeam] = (table[match.homeTeam] || 0) + 1;
          table[match.awayTeam] = (table[match.awayTeam] || 0) + 1;
        }
      });
      const winner = Object.keys(table).sort(
        (a, b) =>
          (table[b] || 0) - (table[a] || 0) ||
          (goals[b] || 0) - (goals[a] || 0),
      )[0];
      return [groupName, winner || null];
    }),
  );
}

function calculateScore(q) {
  const predictions = parseObj(q.resultsJson);
  const winnerPredictions = parseObj(q.winnersJson);
  const realWinners = calculateRealGroupWinners(currentMatches);
  const matchScope = q.isKnockout
    ? currentMatches.filter((match) => KNOCKOUT_GROUPS.includes(match.group))
    : currentMatches.filter((match) => match.group.startsWith("Grupo"));
  let totalPoints = 0;

  matchScope.forEach((match) => {
    const real = match.finished ? regularTimeScore(match) : null;
    if (!real) return;
    const prediction = predictions[match.id];
    const predictedHome = Number.parseInt(prediction?.homeScore, 10);
    const predictedAway = Number.parseInt(prediction?.awayScore, 10);
    if (!Number.isFinite(predictedHome) || !Number.isFinite(predictedAway)) return;

    const [realHome, realAway] = real;
    if (predictedHome === realHome && predictedAway === realAway) totalPoints += 2;
    else if (Math.sign(predictedHome - predictedAway) === Math.sign(realHome - realAway)) totalPoints += 1;
  });

  if (q.isKnockout) {
    Object.keys(KNOCKOUT_WINNER_POINTS).forEach((round) => {
      const match = currentMatches.find((item) => item.group === round);
      const winner = matchWinner(match);
      if (winner && winnerPredictions[round] === winner) {
        totalPoints += knockoutWinnerPointValue(round);
      }
    });
  } else {
    Object.entries(realWinners).forEach(([groupName, winner]) => {
      if (winner && winnerPredictions[groupName] === winner) totalPoints += 2;
    });
  }
  return totalPoints;
}
function filtered(items) {
  const phaseItems =
    selectedPhase === "groups"
      ? items.filter((q) => !q.isKnockout)
      : selectedPhase === "knockout"
        ? items.filter((q) => q.isKnockout)
        : items;
  if (selectedTab === "sent") return phaseItems.filter((q) => q.isSent);
  if (selectedTab === "created") return phaseItems.filter((q) => !q.isSent);
  return phaseItems;
}

function render() {
  if (currentView === "editor" && editingId) return renderEditor(editingId);
  renderList();
}

function renderList() {
  currentView = "list";
  editingId = null;
  syncSelectedPhaseWithEditablePhases();
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

    <section class="phase-tabs" aria-label="Fase de quiniela">
      <button class="phase-tab ${selectedPhase === "all" ? "active" : ""}" data-phase="all" type="button">Todas</button>
      <button class="phase-tab ${selectedPhase === "groups" ? "active" : ""}" data-phase="groups" type="button">Grupos</button>
      <button class="phase-tab ${selectedPhase === "knockout" ? "active" : ""}" data-phase="knockout" type="button">Eliminatorias</button>
    </section>

    <button id="cloudLoadBtn" class="cloud-btn" type="button">☁️ Cargar mis quinielas (Cloud)</button>

    <aside class="points-info">
      <span aria-hidden="true">ⓘ</span>
      <div><strong>CÁLCULO DE PUNTOS</strong><p>Los puntos de esta sección no consideran juegos en vivo, solo juegos finalizados.</p></div>
    </aside>

    <section id="quinielasList" class="quinielas-list">
      ${items.map((q) => renderQuinielaCard(q)).join("")}
      <div class="create-grid">
        <button class="create-card" data-create-phase="groups" type="button"><span style="font-size:1.7rem">＋</span><div><b>Crear fase de grupos</b><span>Marcadores y ganadores de grupo</span></div></button>
        <button class="create-card" data-create-phase="knockout" type="button"><span style="font-size:1.7rem">＋</span><div><b>Crear eliminatorias</b><span>Finales, campeón y tercer lugar</span></div></button>
      </div>
    </section>`;
  syncCreationControls();
  bindListEvents();
}

function syncCreationControls() {
  document.querySelectorAll("[data-create-phase]").forEach((button) => {
    const isKnockout = button.dataset.createPhase === "knockout";
    if (!isPhaseEditable(isKnockout)) button.remove();
  });
  document.querySelectorAll("[data-create-phase-option]").forEach((button) => {
    const isKnockout = button.dataset.createPhaseOption === "knockout";
    button.hidden = !isPhaseEditable(isKnockout);
  });
  const createGrid = document.querySelector(".create-grid");
  if (createGrid && !createGrid.querySelector("[data-create-phase]")) {
    createGrid.innerHTML = '<p class="round-locked-note">La creación de quinielas está cerrada por ahora.</p>';
  }
}

function renderQuinielaCard(q) {
  const st = statusOf(q);
  const owner = q.propietarioName || "Anónimo";
  const email = q.userEmail || "Sin correo";
  const points = `${calculateScore(q)} puntos`;
  return `<article class="q-card" data-id="${q.id}">
    <div class="q-main">
      <h2>${escapeHtml(q.quinielaName || "Sin nombre")}</h2>
      <span class="phase-badge">${q.isKnockout ? "Eliminatorias" : "Grupos"}</span>
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

  document.querySelectorAll(".phase-tab").forEach((btn) =>
    btn.addEventListener("click", () => {
      selectedPhase = btn.dataset.phase;
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

  document.querySelectorAll("[data-create-phase]").forEach((button) => {
    button.addEventListener("click", () => createNew(button.dataset.createPhase === "knockout"));
  });
}

function openEditor(id) {
  editingId = id;
  currentView = "editor";
  renderEditor(id);
}

function createNew(isKnockout = false) {
  if (!isPhaseEditable(isKnockout)) {
    showToast("La edición de esta fase está cerrada.");
    return;
  }
  const profile = getProfile();
  const items = getQuinielas();
  const baseName = isKnockout ? "Nueva Eliminatoria" : "Nueva Quiniela";
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
    isKnockout,
    isSent: false,
    isFavorite: false,
    resultsJson: JSON.stringify(createEmptyResults(isKnockout ? knockoutMatches() : groupMatches())),
    winnersJson: JSON.stringify(createEmptyWinners()),
    points: null,
  };

  items.push(newQuiniela);
  saveQuinielas(items);
  selectedTab = "all";
  selectedPhase = isKnockout ? "knockout" : "groups";
  showToast("Nueva quiniela creada");
  openEditor(newQuiniela.id);
}

function renderEditor(id) {
  const q = getQuinielas().find((x) => x.id === id);
  if (!q) {
    currentView = "list";
    return renderList();
  }

  const matchScope = q.isKnockout
    ? currentMatches.filter((match) => KNOCKOUT_GROUPS.includes(match.group))
    : currentMatches.filter((match) => match.group.startsWith("Grupo"));
  const results = { ...createEmptyResults(matchScope), ...parseObj(q.resultsJson) };
  const winners = parseObj(q.winnersJson);
  const groups = Object.groupBy
    ? Object.groupBy(matchScope, (m) => m.group)
    : groupBy(matchScope, "group");

  pageEl.innerHTML = `<header class="editor-header">
      <button id="backToListBtn" class="back-btn" type="button">‹</button>
      <div>
        <h1>${q.isKnockout ? "LLENAR ELIMINATORIAS" : "LLENAR QUINIELA"}</h1>
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
      ${
        q.isKnockout
          ? `${renderKnockoutFavorites(winners)}${KNOCKOUT_GROUPS.map((groupName) => renderKnockoutRoundEditor(groupName, groups[groupName] || [], results)).join("")}`
          : groupNames().map((groupName) => renderGroupEditor(groupName, groups[groupName] || [], results, winners)).join("")
      }
    </section>

    <footer class="editor-bottom-bar">
      <button id="saveEditorBtn" class="secondary" type="button">Guardar</button>
      <button id="sendEditorBtn" class="danger-btn" type="button" ${q.isSent && !q.isKnockout ? "disabled" : ""}>${q.isSent ? (q.isKnockout ? "Re-enviar" : "Enviada ✓") : "Enviar"}</button>
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
    map.set(m.homeTeam, teamFlagEmoji(m.homeTeam, m.homeFlag));
    map.set(m.awayTeam, teamFlagEmoji(m.awayTeam, m.awayFlag));
  });
  return [...map.entries()].map(([team, flag]) => ({ team, flag }));
}

function qualifiedTeams() {
  const teamsFromRound32 = currentMatches
    .filter((match) => match.group === "16avos de Final")
    .flatMap((match) => [
      { team: match.homeTeam, flag: teamFlagEmoji(match.homeTeam, match.homeFlag) },
      { team: match.awayTeam, flag: teamFlagEmoji(match.awayTeam, match.awayFlag) },
    ])
    .filter((item) => item.team && item.team !== "Por definir");
  const fallbackTeams = groupMatches().flatMap((match) => [
    { team: match.homeTeam, flag: teamFlagEmoji(match.homeTeam, match.homeFlag) },
    { team: match.awayTeam, flag: teamFlagEmoji(match.awayTeam, match.awayFlag) },
  ]);
  const source = teamsFromRound32.length ? teamsFromRound32 : fallbackTeams;
  return [...new Map(source.map((item) => [item.team, item])).values()].sort((a, b) =>
    a.team.localeCompare(b.team),
  );
}

function hasMatchStarted(match) {
  if (!match) return false;
  if (match.started || match.finished || match.isActive) return true;
  const kickoff = matchTimestamp(match);
  return Number.isFinite(kickoff) && Date.now() >= kickoff;
}

function firstRoundOf16Match() {
  return currentMatches
    .filter((match) => match.group === "Octavos de Final")
    .sort((a, b) => matchTimestamp(a) - matchTimestamp(b))[0];
}

function areKnockoutFavoritesEnabled() {
  const firstOctavos = firstRoundOf16Match();
  return firstOctavos ? !hasMatchStarted(firstOctavos) : true;
}

function isThirdPlaceEnabled() {
  const first = currentMatches.find((match) => match.id === "R32_1");
  const second = currentMatches.find((match) => match.id === "R32_2");
  return !(hasMatchStarted(first) && hasMatchStarted(second));
}

function isChampionEnabled() {
  return areKnockoutFavoritesEnabled();
}

function renderKnockoutFavorites(winners) {
  const teams = qualifiedTeams();
  const options = (selected) =>
    `<option value="">Seleccionar equipo</option>${teams
      .map(
        (item) =>
          `<option value="${escapeHtml(item.team)}" ${selected === item.team ? "selected" : ""}>${item.flag} ${escapeHtml(item.team)}</option>`,
      )
      .join("")}`;
  return `<article class="group-card-editor favorites-editor">
    <button class="group-title" type="button" data-group-toggle>Favoritos <span>⌄</span></button>
    <div class="group-body">
      <label class="winner-box">Campeón del Mundo
        <select data-winner-group="Final" ${isChampionEnabled() ? "" : "disabled"}>${options(winners.Final || "")}</select>
      </label>
      <label class="winner-box">Tercer Lugar
        <select data-winner-group="Tercer Lugar" ${isThirdPlaceEnabled() ? "" : "disabled"}>${options(winners["Tercer Lugar"] || "")}</select>
      </label>
    </div>
  </article>`;
}

function renderKnockoutRoundEditor(groupName, matches, results) {
  if (!matches.length) return "";
  const unlocked =
    groupName === "16avos de Final" ||
    matches.some((match) => match.homeTeam !== "Por definir" || match.awayTeam !== "Por definir");
  return `<article class="group-card-editor ${unlocked ? "" : "locked"}">
    <button class="group-title" type="button" data-group-toggle>${escapeHtml(groupName)} <span>${unlocked ? "⌄" : "🔒"}</span></button>
    <div class="group-body">
      ${unlocked ? matches.map((match) => renderMatchEditor(match, results[match.id] || { homeScore: "", awayScore: "" })).join("") : '<p class="round-locked-note">La ronda se desbloquea cuando tenga equipos definidos.</p>'}
    </div>
  </article>`;
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
  const locked = KNOCKOUT_GROUPS.includes(match.group) && (match.started || match.finished || match.isActive);
  const homeFlag = teamFlagEmoji(match.homeTeam, match.homeFlag);
  const awayFlag = teamFlagEmoji(match.awayTeam, match.awayFlag);
  return `<article class="match-editor" data-match-id="${match.id}">
    <div class="match-date">${escapeHtml(match.group)} • ${formatLocalMatchDate(match, { month: "long" })} • ${formatLocalMatchTime(match)} hrs</div>
    <div class="match-row-editor">
      <div class="team-editor">${teamFlagMarkup(match.homeTeam, homeFlag, "editor-flag")}<b>${escapeHtml(match.homeTeam)}</b></div>
      <div class="score-editor">
        <input data-score="home" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${escapeHtml(result.homeScore ?? "")}" ${locked ? "disabled" : ""} />
        <span>-</span>
        <input data-score="away" inputmode="numeric" pattern="[0-9]*" maxlength="2" value="${escapeHtml(result.awayScore ?? "")}" ${locked ? "disabled" : ""} />
      </div>
      <div class="team-editor away"><b>${escapeHtml(match.awayTeam)}</b>${teamFlagMarkup(match.awayTeam, awayFlag, "editor-flag")}</div>
    </div>
  </article>`;
}

function collectEditorData(id) {
  const q = getQuinielas().find((x) => x.id === id);
  const scope = q?.isKnockout ? knockoutMatches() : groupMatches();
  const results = { ...createEmptyResults(scope), ...parseObj(q?.resultsJson) };
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
    if (q?.isKnockout) winners[group] = select.value || "";
    else if (select.value) winners[group] = select.value;
    else delete winners[group];
  });

  const normalizedWinners = q?.isKnockout ? normalizeKnockoutWinners(winners) : winners;

  return {
    quinielaName: $("editQuinielaName")?.value.trim() || "",
    propietarioName: $("editOwner")?.value.trim() || "",
    userEmail: $("editEmail")?.value.trim() || "",
    quinielaCode:
      $("editAccessCode")?.value.trim() ||
      getProfile().accessCode ||
      "",
    results,
    winners: normalizedWinners,
  };
}

function enrichKnockoutResultsForCloud(results) {
  const matchesById = new Map(currentMatches.map((match) => [match.id, match]));
  return Object.fromEntries(
    knockoutMatches().map((staticMatch) => {
      const match = matchesById.get(staticMatch.id) || staticMatch;
      const result = results[staticMatch.id] || { homeScore: "", awayScore: "" };
      const homeFlag = teamFlagEmailEmoji(match.homeTeam, match.homeFlag);
      const awayFlag = teamFlagEmailEmoji(match.awayTeam, match.awayFlag);
      return [
        staticMatch.id,
        {
          homeTeam: match.homeTeam || "",
          awayTeam: match.awayTeam || "",
          homeFlag,
          awayFlag,
          homeScore: result.homeScore ?? "",
          awayScore: result.awayScore ?? "",
        },
      ];
    }),
  );
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
    const cloudPayload = q.isKnockout
      ? {
          ...q,
          resultsJson: JSON.stringify(enrichKnockoutResultsForCloud(parseObj(q.resultsJson))),
          winnersJson: JSON.stringify(normalizeKnockoutWinners(parseObj(q.winnersJson))),
        }
      : q;
    const cloud = await saveQuinielaCloud(cloudPayload);
    q.cloudMapKey = cloud.mapKey;
    saveQuinielas(items);
    await syncAchievementsAfterChange();
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
  const matchesComplete = q.isKnockout
    ? knockoutMatches().every((m) => !isIncompleteResult(data.results[m.id]))
    : groupMatches().every(
        (m) =>
          data.results[m.id]?.homeScore !== "" &&
          data.results[m.id]?.awayScore !== "",
      );
  const winnersComplete = q.isKnockout
    ? (!isThirdPlaceEnabled() || Boolean(data.winners["Tercer Lugar"]))
    : groupNames().every((g) => data.winners[g]);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.userEmail || "");
  const requiredIdentityComplete =
    Boolean(data.quinielaName.trim()) && Boolean(data.propietarioName.trim()) && emailValid;

  if (!requiredIdentityComplete) {
    return showToast("Correo, propietario y nombre de quiniela son obligatorios.");
  }
  if (!matchesComplete && !winnersComplete)
    return showToast("Llena todos los marcadores y ganadores");
  if (!matchesComplete) return showToast("Llena todos los marcadores");
  if (!winnersComplete) {
    return showToast(
      q.isKnockout ? "Debes seleccionar un favorito para el Tercer Lugar." : "Elige ganador de cada grupo",
    );
  }

  const button = $("sendEditorBtn");
  if (button && !q.isKnockout) button.disabled = true;
  try {
    const codeResult = await validateAccessCode(data.quinielaCode);
    if (!codeResult.ok) return showToast(codeResult.message);

    const cloudResults = q.isKnockout ? enrichKnockoutResultsForCloud(data.results) : data.results;
    const cloud = await sendQuinielaCloud({
      ...q,
      ...data,
      resultsJson: JSON.stringify(cloudResults),
      winnersJson: JSON.stringify(q.isKnockout ? normalizeKnockoutWinners(data.winners) : data.winners),
    });
    q.isSent = true;
    q.points = q.points ?? 0;
    q.cloudId = cloud.documentId;
    q.quinielaCode = data.quinielaCode;
    saveQuinielas(items);
    await syncAchievementsAfterChange();
    renderEditor(id);
    showToast(
      cloud.webhookDelivered
        ? "Quiniela enviada correctamente"
        : "Quiniela registrada; notificación pendiente",
    );
  } catch (error) {
    showToast(error.message || "No se pudo enviar la quiniela");
  } finally {
    if (button?.isConnected && !q.isKnockout) button.disabled = false;
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
  const profileEmail = String(getProfile().email || "").trim().toLowerCase();
  $("deleteServerBtn").hidden =
    !profileEmail || profileEmail !== String(q.userEmail || "").trim().toLowerCase();
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

$("fabBtn")?.addEventListener("click", () => {
  syncCreationControls();
  const options = editablePhases();
  if (!options.length) return showToast("La creación de quinielas está cerrada por ahora.");
  if (options.length === 1) return createNew(options[0].isKnockout);
  createPhaseDialog?.showModal();
});
document.querySelectorAll("[data-create-phase-option]").forEach((button) => {
  button.addEventListener("click", () => {
    const isKnockout = button.dataset.createPhaseOption === "knockout";
    if (!isPhaseEditable(isKnockout)) return showToast("La edición de esta fase está cerrada.");
    createPhaseDialog?.close();
    createNew(isKnockout);
  });
});
$("cancelCreatePhaseBtn")?.addEventListener("click", () => createPhaseDialog?.close());
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
    await syncAchievementsAfterChange();
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
  const q = getQuinielas().find((x) => x.id === selectedId);
  const profileEmail = String(getProfile().email || "").trim().toLowerCase();
  if (!q || profileEmail !== String(q.userEmail || "").trim().toLowerCase()) {
    return showToast("Solo el propietario puede eliminar de Cloud");
  }
  deleteDialog.close();
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

saveQuinielas(getQuinielas());
renderList();
refreshAppConfig();

window.addEventListener("storage", (event) => {
  if (!event.key || event.key === APP_CONFIG_CACHE_KEY) {
    appConfig = readCachedAppConfig();
    render();
  }
});

observeMatches(
  MATCHES,
  (matches) => {
    currentMatches = matches;
    if (currentView === "list") renderList();
    else if (currentView === "editor" && selectedId) renderEditor(selectedId);
  },
  () => showToast("No se pudieron actualizar los puntos"),
);
