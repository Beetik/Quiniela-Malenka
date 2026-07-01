import { MATCHES } from "./matches-data.js";
import { loadAppConfig, loadOfficialParticipants, observeMatches } from "./firebase-service.js";
import { extraTimeMarkup, finalScore, regularTimeScore } from "./match-score-utils.js";
import { teamFlagMarkup } from "./team-flags.js";
import {
  formatLocalMatchDate,
  formatLocalMatchTime,
  matchTimestamp,
  sameLocalKickoff,
} from "./timezone-utils.js";

const USER_KEY = "quinielaMalenka.user";
const POOLS_KEY = "quinielaMalenka.saved";
const APP_CONFIG_CACHE_KEY = "quinielaMalenka.appConfig";
const WORLD_CUP_START = "2026-06-11";
const KNOCKOUT_GROUPS = [
  "16avos de Final",
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinales",
  "Tercer Lugar",
  "Final",
];

const $ = (id) => document.getElementById(id);
let selectedPoolId = "";
let officialParticipants = [];
let officialParticipantsCode = null;
let appConfig = readCachedAppConfig();

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || "") ?? fallback;
  } catch {
    return fallback;
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
  return normalizeAppConfig(parseJson(localStorage.getItem(APP_CONFIG_CACHE_KEY), null));
}

function activePhase() {
  return appConfig.visibleFinal && !appConfig.visibleGroups ? "knockout" : "groups";
}

function activePhaseLabel() {
  return activePhase() === "knockout" ? "fase final" : "fase de grupos";
}

function isKnockoutMatch(match) {
  return KNOCKOUT_GROUPS.includes(match.group);
}

function activeMatches() {
  return MATCHES.filter((match) =>
    activePhase() === "knockout" ? isKnockoutMatch(match) : match.group.startsWith("Grupo"),
  );
}

function activeGroups() {
  if (activePhase() !== "groups") return [];
  return [...new Set(activeMatches().map((match) => match.group))];
}

function phasePools(pools = getPools()) {
  const phaseIsKnockout = activePhase() === "knockout";
  return pools.filter((pool) => Boolean(pool.isKnockout) === phaseIsKnockout);
}

function getUser() {
  return parseJson(localStorage.getItem(USER_KEY), null);
}

function getPools() {
  const pools = parseJson(localStorage.getItem(POOLS_KEY), []);
  return Array.isArray(pools) ? pools : [];
}

function chooseInitialPool(pools) {
  const candidates = phasePools(pools);
  return (
    candidates.find((pool) => pool.isFavorite) ||
    candidates.find((pool) => pool.isSent) ||
    candidates[0] ||
    null
  );
}

function getSelectedPool() {
  const pools = getPools();
  const candidates = phasePools(pools);
  const selected = candidates.find((pool) => String(pool.id) === selectedPoolId);
  const fallback = chooseInitialPool(pools);
  if (!selected && fallback) selectedPoolId = String(fallback.id);
  return selected || fallback;
}

function officialScore(match) {
  if (!match.finished) return null;
  return regularTimeScore(match);
}

function displayScore(match) {
  return finalScore(match);
}

function resultKind(home, away) {
  if (home > away) return 1;
  if (home < away) return 2;
  return 0;
}

function calculateRealGroupWinners() {
  return Object.fromEntries(
    activeGroups().map((group) => {
      const matches = MATCHES.filter((match) => match.group === group);
      if (!matches.every((match) => match.finished)) return [group, null];
      const finished = matches.filter((match) => officialScore(match));
      if (!finished.length) return [group, null];

      const points = {};
      const goals = {};
      finished.forEach((match) => {
        const [home, away] = officialScore(match);
        goals[match.homeTeam] = (goals[match.homeTeam] || 0) + home;
        goals[match.awayTeam] = (goals[match.awayTeam] || 0) + away;
        if (home > away) points[match.homeTeam] = (points[match.homeTeam] || 0) + 3;
        else if (home < away)
          points[match.awayTeam] = (points[match.awayTeam] || 0) + 3;
        else {
          points[match.homeTeam] = (points[match.homeTeam] || 0) + 1;
          points[match.awayTeam] = (points[match.awayTeam] || 0) + 1;
        }
      });

      const winner = Object.keys(points).sort(
        (a, b) => (points[b] || 0) - (points[a] || 0) || (goals[b] || 0) - (goals[a] || 0),
      )[0];
      return [group, winner || null];
    }),
  );
}

function knockoutWinner(roundName) {
  const match = MATCHES.find((item) => item.group === roundName);
  const score = match ? officialScore(match) : null;
  if (!match || !score || score[0] === score[1]) return null;
  return score[0] > score[1] ? match.homeTeam : match.awayTeam;
}

function calculateStats(pool) {
  if (!pool) return { totalPoints: 0, hits: 0, exacts: 0 };

  const predictions = parseJson(pool.resultsJson, {});
  const winnerPredictions = parseJson(pool.winnersJson, {});
  const realWinners = calculateRealGroupWinners();
  let totalPoints = 0;
  let hits = 0;
  let exacts = 0;

  activeMatches().forEach((match) => {
    const real = officialScore(match);
    const prediction = predictions[match.id];
    if (!real || !prediction) return;

    const home = Number.parseInt(prediction.homeScore, 10);
    const away = Number.parseInt(prediction.awayScore, 10);
    if (!Number.isFinite(home) || !Number.isFinite(away)) return;

    if (home === real[0] && away === real[1]) {
      exacts += 1;
      hits += 1;
      totalPoints += 2;
    } else if (resultKind(home, away) === resultKind(real[0], real[1])) {
      hits += 1;
      totalPoints += 1;
    }
  });

  activeGroups().forEach((group) => {
    const groupMatches = MATCHES.filter((match) => match.group === group);
    const groupFinished = groupMatches.every((match) => officialScore(match));
    if (
      groupFinished &&
      realWinners[group] &&
      winnerPredictions[group] === realWinners[group]
    ) {
      totalPoints += 2;
    }
  });

  if (activePhase() === "knockout") {
    ["Final", "Tercer Lugar"].forEach((round) => {
      const winner = knockoutWinner(round);
      if (winner && winnerPredictions[round] === winner) totalPoints += 2;
    });
  }

  return { totalPoints, hits, exacts };
}

function cloudParticipantToPool(item) {
  const isKnockout = Boolean(item.isKnockout);
  return {
    id: item.id,
    quinielaName: item.quinielaName || "Sin nombre",
    propietarioName: item.propietarioName || "Anónimo",
    userEmail: item.userEmail || "",
    resultsJson: JSON.stringify(item.results || {}),
    winnersJson: JSON.stringify(isKnockout ? item.winners || {} : item.groupWinners || {}),
    isKnockout,
    isSent: true,
  };
}

async function refreshOfficialParticipants() {
  const code = getUser()?.accessCode || "";
  const participantCacheKey = `${code}::${activePhase()}`;
  if (officialParticipantsCode === participantCacheKey) return;
  officialParticipantsCode = participantCacheKey;
  if (!code.trim()) {
    officialParticipants = [];
    return;
  }
  try {
    officialParticipants = phasePools((await loadOfficialParticipants(code)).map(cloudParticipantToPool));
    renderDashboard();
  } catch {
    officialParticipants = phasePools(getPools().filter((item) => item.isSent));
    showToast("No se pudo cargar el ranking en nube. Usando datos locales.");
    renderDashboard();
  }
}

async function refreshAppConfig() {
  try {
    appConfig = normalizeAppConfig(await loadAppConfig());
    localStorage.setItem(APP_CONFIG_CACHE_KEY, JSON.stringify(appConfig));
    officialParticipantsCode = null;
    renderDashboard();
  } catch {
    appConfig = readCachedAppConfig();
  }
}

function calculateStatsInfo(pool) {
  if (!pool) {
    return null;
  }
  const stats = calculateStats(pool);
  const officialScores = officialParticipants.map(
    (participant) => calculateStats(participant).totalPoints,
  );
  const currentPoints = stats.totalPoints;
  const betterCount = officialScores.filter(
    (score) => score > currentPoints,
  ).length;
  const positionReal = betterCount + 1;
  const distinctScores = [...new Set(officialScores)].sort((a, b) => b - a);
  const positionTabla =
    (distinctScores.findIndex((score) => score <= currentPoints) >= 0
      ? distinctScores.findIndex((score) => score <= currentPoints)
      : distinctScores.length) + 1;
  const scopeMatches = activeMatches();
  const finishedMatches = scopeMatches.filter((match) => match.finished).length;
  const finishedGroups = activeGroups().filter((group) =>
    MATCHES.filter((match) => match.group === group).every(
      (match) => match.finished,
    ),
  ).length;
  const finishedKnockoutBonuses =
    activePhase() === "knockout"
      ? ["Final", "Tercer Lugar"].filter((round) => Boolean(knockoutWinner(round))).length
      : 0;
  const maxPoints = finishedMatches * 2 + (finishedGroups + finishedKnockoutBonuses) * 2;
  const effectiveness =
    maxPoints > 0 ? Math.trunc((currentPoints / maxPoints) * 100) : 0;

  return {
    ...stats,
    positionReal,
    positionTabla,
    totalOfficial: officialScores.length,
    finishedMatches,
    totalMatches: scopeMatches.length,
    maxPoints,
    effectiveness,
  };
}

function getPoolStatus(pool) {
  if (!pool) return { label: "Borrador", className: "status-draft" };
  const results = parseJson(pool.resultsJson, {});
  const winners = parseJson(pool.winnersJson, {});
  const completedMatches = activeMatches().filter((match) => {
    const prediction = results[match.id];
    return (
      prediction &&
      prediction.homeScore !== "" &&
      prediction.awayScore !== "" &&
      prediction.homeScore != null &&
      prediction.awayScore != null
    );
  }).length;
  const requiredWinners = activePhase() === "knockout" ? ["Final", "Tercer Lugar"] : activeGroups();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pool.userEmail || "");
  const complete =
    completedMatches === activeMatches().length &&
    requiredWinners.every((key) => Boolean(winners[key])) &&
    emailValid;

  if (pool.isSent) return { label: "Enviada", className: "status-sent" };
  if (complete) return { label: "Completa", className: "status-complete" };
  return { label: "Borrador", className: "status-draft" };
}

function daysUntilStart() {
  const today = new Date();
  const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [year, month, day] = WORLD_CUP_START.split("-").map(Number);
  const start = new Date(year, month - 1, day);
  return Math.max(0, Math.ceil((start - currentDay) / 86400000));
}

function getNextMatches() {
  const scopeMatches = activeMatches();
  const live = scopeMatches.filter((match) => match.started && match.isActive);
  if (live.length) return live;

  const upcoming = scopeMatches.filter((match) => !match.finished).sort(
    (a, b) => matchTimestamp(a) - matchTimestamp(b),
  );
  if (upcoming.length) {
    const first = upcoming[0];
    return upcoming.filter((match) => sameLocalKickoff(match, first));
  }
  return scopeMatches.length ? [scopeMatches[scopeMatches.length - 1]] : [];
}

function formatMatchDate(match) {
  return formatLocalMatchDate(match);
}

function renderHeader() {
  const user = getUser();
  $("welcomeTitle").innerHTML = user?.name
    ? `Hola ${escapeHtml(user.name)} <span aria-hidden="true">&#128075;</span>`
    : '¡Hola! <span aria-hidden="true">&#128075;</span>';
  const days = daysUntilStart();
  $("countdownText").textContent =
    days > 0
      ? `Faltan ${days} días para el inicio`
      : "¡El mundial ha comenzado!";
}

function renderSummary() {
  const pools = phasePools(getPools());
  const pool = getSelectedPool();

  if (!pool) {
    $("summarySection").innerHTML = `
      <article class="summary-card empty-summary">
        <strong>MI QUINIELA OFICIAL</strong>
        <p>Aún no tienes una quiniela guardada.</p>
        <a class="primary-link" href="addquiniela.html">Crear quiniela</a>
      </article>`;
    return;
  }

  selectedPoolId = String(pool.id);
  const info = calculateStatsInfo(pool);
  const status = getPoolStatus(pool);

  $("summarySection").innerHTML = `
    <article class="summary-card">
      <div class="summary-head">
        <div class="summary-label">
          ${pool.isFavorite ? '<span class="official-star">&#9733;</span>' : ""}
          <span>MI QUINIELA OFICIAL</span>
          <small>${activePhaseLabel()}</small>
        </div>
        <select id="poolSelector" class="pool-select" aria-label="Cambiar quiniela">
          ${pools
            .map(
              (item) =>
                `<option value="${escapeHtml(String(item.id))}" ${
                  String(item.id) === selectedPoolId ? "selected" : ""
                }>${item.isFavorite ? "★ " : ""}${escapeHtml(item.quinielaName || "Sin nombre")}</option>`,
            )
            .join("")}
        </select>
      </div>
      <h2 class="summary-name">${escapeHtml(pool.quinielaName || "Sin nombre")}</h2>
      <div class="summary-metrics">
        <div class="summary-metric">
          <span>Estado</span>
          <strong class="${status.className}">${status.label}</strong>
        </div>
        <div class="summary-metric">
          <span>Puntaje</span>
          <strong>${info?.totalPoints ?? 0} pts</strong>
        </div>
        <div class="summary-metric">
          <span>Posición</span>
          <strong>${info ? `${info.positionReal} / ${info.totalOfficial}` : "-"}</strong>
        </div>
      </div>
    </article>`;

  $("poolSelector").addEventListener("change", (event) => {
    selectedPoolId = event.target.value;
    renderDashboard();
  });
}

function renderMatches() {
  const matches = getNextMatches();
  const pool = getSelectedPool();
  const predictions = parseJson(pool?.resultsJson, {});
  const hasLive = matches.some((match) => match.started && match.isActive);
  $("nextMatchTitle").textContent = hasLive ? "EN CURSO" : "PRÓXIMO PARTIDO";
  $("nextMatches").innerHTML = matches
    .map((match) => matchCard(match, predictions[match.id]))
    .join("");
}

function matchCard(match, prediction) {
  const live = match.started && match.isActive;
  const finished = match.finished && !match.isActive;
  const hasPrediction =
    prediction &&
    prediction.homeScore !== "" &&
    prediction.awayScore !== "" &&
    prediction.homeScore != null &&
    prediction.awayScore != null;
  const venue = venueMarkup(match);
  const showVenueAboveTeams = match.started || live || finished;
  let center;

  if (live) {
    const score = displayScore(match);
    center = `
      <span class="live-badge">VIVO</span>
      <strong class="live-score">${score ? `${score[0]} - ${score[1]}` : "-"}</strong>`;
  } else if (finished) {
    const score = displayScore(match);
    center = `
      <small>FINAL</small>
      <strong>${score ? `${score[0]} - ${score[1]}` : "-"}</strong>`;
  } else {
    center = `
      <small>${formatMatchDate(match)}</small>
      <strong>${formatLocalMatchTime(match)}</strong>`;
  }

  return `
    <article class="match-preview">
      ${showVenueAboveTeams ? venue : ""}
      <div class="match-preview-main">
        <div class="preview-team">
          ${teamFlagMarkup(match.homeTeam, match.homeFlag, "flag")}
          <strong>${escapeHtml(match.homeTeam)}</strong>
        </div>
        <div class="preview-center">${center}</div>
        <div class="preview-team">
          ${teamFlagMarkup(match.awayTeam, match.awayFlag, "flag")}
          <strong>${escapeHtml(match.awayTeam)}</strong>
        </div>
      </div>
      ${showVenueAboveTeams ? "" : venue}
      ${penaltyMarkup(match)}
      ${extraTimeMarkup(match, escapeHtml)}
      ${scorersMarkup(match)}
      ${
        hasPrediction
          ? `<div class="user-prediction">
              <span>TU PRONÓSTICO:</span>
              <strong>${escapeHtml(prediction.homeScore)} - ${escapeHtml(prediction.awayScore)}</strong>
            </div>`
          : ""
      }
    </article>`;
}

function venueText(match) {
  const stadium = match.stadiumName || match.stadiumFifaName || "";
  const location =
    match.stadiumLocation ||
    [match.stadiumCity, match.stadiumCountry].filter(Boolean).join(", ");
  if (stadium && location) return `${stadium} · ${location}`;
  return stadium || location || "";
}

function venueMarkup(match) {
  const stadium = match.stadiumName || match.stadiumFifaName || "";
  const city = match.stadiumCity || "";
  const country = match.stadiumCountry || "";
  const fallback = venueText(match);
  if (!stadium && !city && !country) {
    return fallback ? `<div class="venue-row"><span>${escapeHtml(fallback)}</span></div>` : "";
  }
  return `<div class="venue-row">
    ${stadium ? `<span class="venue-name">${escapeHtml(stadium)}</span>` : ""}
    ${city ? `<span>${escapeHtml(city)}</span>` : ""}
    ${country ? `<span>${escapeHtml(country)}</span>` : ""}
  </div>`;
}

function scorerListMarkup(items) {
  return (items || [])
    .filter(Boolean)
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");
}

function scorersMarkup(match) {
  const home = scorerListMarkup(match.homeScorers);
  const away = scorerListMarkup(match.awayScorers);
  if (!home && !away) return "";
  return `<div class="scorers-row">
    <div class="scorers-team">
      <strong>${escapeHtml(match.homeTeam)}</strong>
      <div>${home || "<span>-</span>"}</div>
    </div>
    <div class="scorers-team away">
      <strong>${escapeHtml(match.awayTeam)}</strong>
      <div>${away || "<span>-</span>"}</div>
    </div>
  </div>`;
}

function penaltyMarkup(match) {
  const home = Number(match.homePenaltyScore || 0);
  const away = Number(match.awayPenaltyScore || 0);
  if (!isKnockoutMatch(match) || (home === 0 && away === 0)) return "";
  return `<div class="penalty-row"><span>Penales:</span><strong>${home} - ${away}</strong></div>`;
}

function renderStats() {
  const pool = getSelectedPool();
  const info = calculateStatsInfo(pool);
  const statsTitle = $("statsCard")?.closest("section")?.querySelector(".section-label");
  if (statsTitle) statsTitle.textContent = `ESTADÍSTICAS PERSONALES · ${activePhaseLabel().toUpperCase()}`;

  $("statsCard").innerHTML = `
    <article class="stats-card">
      <div class="stats-grid">
        ${statItem("Posición real", info ? info.positionReal : "-", info ? `/ ${info.totalOfficial}` : "")}
        ${statItem("En la tabla", info ? info.positionTabla : "-")}
        ${statItem("Partidos", info ? info.finishedMatches : "-", info ? `/ ${info.totalMatches}` : "")}
        ${statItem("Aciertos", info?.hits ?? 0)}
        ${statItem("Exactos", info?.exacts ?? 0)}
        ${statItem("Puntaje", info?.totalPoints ?? 0, info ? `/ ${info.maxPoints}` : "")}
      </div>
      <div class="stats-effectiveness">
        ${statItem("Efectividad", `${info?.effectiveness ?? 0}%`)}
      </div>
    </article>`;
}

function statItem(label, value, subValue = "") {
  return `
    <div class="stat-item">
      <span>${label}</span>
      <strong>${value}</strong>
      ${subValue ? `<small>${subValue}</small>` : ""}
    </div>`;
}

function renderDashboard() {
  refreshOfficialParticipants();
  renderHeader();
  renderSummary();
  renderMatches();
  renderStats();
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character],
  );
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.add("show");
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2200);
}

$("notificationsBtn").addEventListener("click", () => {
  showToast("No tienes notificaciones nuevas");
});

window.addEventListener("storage", (event) => {
  if (!event.key || event.key === APP_CONFIG_CACHE_KEY) {
    appConfig = readCachedAppConfig();
    officialParticipantsCode = null;
  }
  renderDashboard();
});
renderDashboard();
refreshAppConfig();

observeMatches(
  MATCHES,
  (updatedMatches) => {
    MATCHES.splice(0, MATCHES.length, ...updatedMatches);
    renderDashboard();
  },
  () => showToast("Sin conexión en vivo. Mostrando datos locales."),
);
