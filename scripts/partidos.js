import { MATCHES } from "./matches-data.js";
import { observeMatches } from "./firebase-service.js";
import { teamFlagMarkup } from "./team-flags.js";

const LIST_KEY = "quinielaMalenka.saved";
const GROUPS = [...new Set(MATCHES.map((match) => match.group))].sort();

const state = {
  view: "matches",
  matchFilter: "Todos",
  standingsFilter: "Todos",
  search: "",
  selectedPoolId: "",
  simulation: false,
};

const $ = (id) => document.getElementById(id);
let lastAutoScrollTarget = "";

function parseObject(value) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function getPools() {
  try {
    const saved = JSON.parse(localStorage.getItem(LIST_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function getSelectedPool() {
  const pools = getPools();
  return pools.find((pool) => String(pool.id) === state.selectedPoolId) || pools[0];
}

function getPredictions() {
  return parseObject(getSelectedPool()?.resultsJson);
}

function getWinnerPredictions() {
  return parseObject(getSelectedPool()?.winnersJson);
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchDateTime(match) {
  return new Date(`${match.date}T${match.time}:00-06:00`);
}

function formatDate(match) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(matchDateTime(match));
}

function dateLabel(match) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
  }).format(matchDateTime(match));
}

function timeLabel(match) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(matchDateTime(match));
}

function isLive(match) {
  return match.started && match.isActive;
}

function isFinished(match) {
  return match.finished && !match.isActive;
}

function officialScore(match) {
  if (
    !match.started ||
    match.realHomeScore == null ||
    match.realAwayScore == null
  ) {
    return null;
  }
  return [match.realHomeScore, match.realAwayScore];
}

function predictedScore(match) {
  const prediction = getPredictions()[match.id];
  if (!prediction) return null;
  const home = prediction.homeScore;
  const away = prediction.awayScore;
  if (home === "" || away === "" || home == null || away == null) return null;
  return [Number(home), Number(away)];
}

function predictionPoints(match) {
  const official = officialScore(match);
  const prediction = predictedScore(match);
  if (!official || !prediction) return "-";
  if (official[0] === prediction[0] && official[1] === prediction[1]) return "2";
  return Math.sign(official[0] - official[1]) ===
    Math.sign(prediction[0] - prediction[1])
    ? "1"
    : "0";
}

function scoreForStandings(match) {
  return state.simulation
    ? predictedScore(match) || officialScore(match)
    : officialScore(match);
}

function hasLiveMatches() {
  return MATCHES.some(isLive);
}

function secondaryFilter() {
  return hasLiveMatches() ? "En Vivo" : "Próximos";
}

function filteredMatches() {
  const query = normalizeText(state.search);
  let matches = [...MATCHES].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time),
  );

  if (query) {
    return matches.filter(
      (match) =>
        normalizeText(match.homeTeam).includes(query) ||
        normalizeText(match.awayTeam).includes(query) ||
        normalizeText(venueText(match)).includes(query),
    );
  }

  if (state.matchFilter === secondaryFilter()) {
    if (hasLiveMatches()) return matches.filter(isLive);
    const firstUpcoming = matches.findIndex((match) => !match.finished);
    return firstUpcoming < 0 ? [] : matches.slice(firstUpcoming, firstUpcoming + 5);
  }

  if (state.matchFilter !== "Todos") {
    matches = matches.filter((match) => match.group === state.matchFilter);
  }

  return matches;
}

function renderPoolSelector() {
  const pools = getPools();
  if (!pools.length) {
    state.selectedPoolId = "";
    $("poolSelect").innerHTML = '<option value="">No hay quinielas guardadas</option>';
    $("poolSelect").disabled = true;
    return;
  }
  if (!pools.some((pool) => String(pool.id) === state.selectedPoolId)) {
    state.selectedPoolId = String(pools[0].id);
  }

  $("poolSelect").disabled = false;
  $("poolSelect").innerHTML = pools
    .map(
      (pool) =>
        `<option value="${escapeHtml(String(pool.id))}">${escapeHtml(
          pool.quinielaName || "Sin nombre",
        )} · ${escapeHtml(pool.propietarioName || "Invitado")}</option>`,
    )
    .join("");
  $("poolSelect").value = state.selectedPoolId;
}

function renderFilters() {
  const active =
    state.view === "matches" ? state.matchFilter : state.standingsFilter;
  const filters =
    state.view === "matches"
      ? ["Todos", secondaryFilter(), ...GROUPS]
      : ["Todos", ...GROUPS];

  $("filterTabs").innerHTML = filters
    .map(
      (filter) =>
        `<button class="filter-chip ${filter === active ? "active" : ""}" data-filter="${filter}" type="button">${filter}</button>`,
    )
    .join("");
}

function renderMatches() {
  const matches = filteredMatches();
  if (!matches.length) {
    $("matchesView").innerHTML =
      '<div class="empty-state">No hay partidos que coincidan con este filtro.</div>';
    return;
  }

  const byDate = Object.groupBy
    ? Object.groupBy(matches, (match) => formatDate(match))
    : matches.reduce((groups, match) => {
        (groups[formatDate(match)] ||= []).push(match);
        return groups;
      }, {});

  $("matchesView").innerHTML = Object.entries(byDate)
    .map(
      ([heading, dayMatches]) => `
        <section class="date-section">
          <div class="date-heading">
            <h2>${heading}</h2>
            <span>${dayMatches.length} partido${dayMatches.length === 1 ? "" : "s"}</span>
          </div>
          <div class="match-list">
            ${dayMatches.map(renderMatchCard).join("")}
          </div>
        </section>`,
    )
    .join("");
  autoScrollToRelevantMatch(matches);
}

function autoScrollToRelevantMatch(matches) {
  const target = matches.find(isLive) || matches.find((match) => !match.finished);
  if (!target || target.id === lastAutoScrollTarget) return;
  lastAutoScrollTarget = target.id;
  requestAnimationFrame(() => {
    document
      .querySelector(`[data-match-id="${CSS.escape(target.id)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

function renderMatchCard(match) {
  const official = officialScore(match);
  const prediction = predictedScore(match);
  const scoreText = official ? `${official[0]} - ${official[1]}` : "-";
  const predictionText = prediction ? `${prediction[0]} - ${prediction[1]}` : "-  -";
  const venue = venueText(match);

  return `
    <article class="match-card" data-match-id="${escapeHtml(match.id)}">
      <div class="match-meta">
        <span>${escapeHtml(match.group)} · ${dateLabel(match)}</span>
        <span>${timeLabel(match)} hrs</span>
      </div>
      ${venue ? `<div class="venue-row">${escapeHtml(venue)}</div>` : ""}
      <div class="match-row">
        <div class="team">
          ${teamFlagMarkup(match.homeTeam, match.homeFlag, "team-flag")}
          <span class="team-name">${escapeHtml(match.homeTeam)}</span>
        </div>
        <div class="score-display ${isLive(match) ? "live" : ""} ${isFinished(match) ? "finished" : ""}">
          ${scoreText}
        </div>
        <div class="team away">
          ${teamFlagMarkup(match.awayTeam, match.awayFlag, "team-flag")}
          <span class="team-name">${escapeHtml(match.awayTeam)}</span>
        </div>
      </div>
      ${
        isLive(match) || isFinished(match)
          ? `<div class="match-status">
              <span class="status-badge ${isLive(match) ? "live" : "finished"}">
                ${isLive(match) ? "VIVO" : "FINALIZADO"}
              </span>
              ${official ? `<span>Real: ${scoreText}</span>` : ""}
            </div>`
          : ""
      }
      <div class="prediction-row">
        <span>Tu pronóstico: <strong>${predictionText}</strong></span>
        <span>Puntos: <strong>${predictionPoints(match)}</strong></span>
      </div>
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

function calculateGroupStats(groupName) {
  const groupMatches = MATCHES.filter((match) => match.group === groupName);
  const teams = new Map();

  groupMatches.forEach((match) => {
    teams.set(match.homeTeam, {
      name: match.homeTeam,
      flag: match.homeFlag,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    });
    teams.set(match.awayTeam, {
      name: match.awayTeam,
      flag: match.awayFlag,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    });
  });

  groupMatches.forEach((match) => {
    const score = scoreForStandings(match);
    if (!score) return;
    const [homeScore, awayScore] = score;
    const home = teams.get(match.homeTeam);
    const away = teams.get(match.awayTeam);

    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.points += 3;
      home.wins += 1;
      away.losses += 1;
    } else if (homeScore < awayScore) {
      away.points += 3;
      away.wins += 1;
      home.losses += 1;
    } else {
      home.points += 1;
      away.points += 1;
      home.draws += 1;
      away.draws += 1;
    }
  });

  return [...teams.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
      b.goalsFor - a.goalsFor,
  );
}

function renderStandings() {
  const query = normalizeText(state.search);
  const relevantGroups = query
    ? new Set(
        MATCHES.filter(
          (match) =>
            normalizeText(match.homeTeam).includes(query) ||
            normalizeText(match.awayTeam).includes(query),
        ).map((match) => match.group),
      )
    : null;
  const groups = (state.standingsFilter === "Todos" ? GROUPS : [state.standingsFilter])
    .filter((group) => !relevantGroups || relevantGroups.has(group));
  const winners = getWinnerPredictions();

  if (!groups.length) {
    $("standingsView").innerHTML =
      '<div class="empty-state">No hay posiciones que coincidan con la búsqueda.</div>';
    return;
  }

  $("standingsView").innerHTML = groups
    .map((group) => {
      const stats = calculateGroupStats(group);
      const favorite = winners[group] || "-";
      const isLeading = favorite !== "-" && stats[0]?.name === favorite;

      return `
        <section class="standings-section">
          <div class="favorite-banner">
            <span>Tu favorito:</span>
            <strong>${favorite}</strong>
            ${isLeading ? '<span title="Líder">&#127942;</span>' : ""}
          </div>
          <h2 class="standings-title">${group.toUpperCase()}</h2>
          <div class="table-wrap">
            <table class="standings-table">
              <thead>
                <tr>
                  <th>Pos</th><th>Equipo</th><th>PJ</th><th>G</th><th>E</th>
                  <th>P</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th>
                </tr>
              </thead>
              <tbody>
                ${stats
                  .map((team, index) => {
                    const played = team.wins + team.draws + team.losses;
                    const difference = team.goalsFor - team.goalsAgainst;
                    return `<tr>
                      <td>${index + 1}</td>
                      <td><span class="standings-team">${teamFlagMarkup(team.name, team.flag, "standings-flag")}${team.name}</span></td>
                      <td>${played}</td><td>${team.wins}</td><td>${team.draws}</td>
                      <td>${team.losses}</td><td>${team.goalsFor}</td>
                      <td>${team.goalsAgainst}</td>
                      <td>${difference > 0 ? `+${difference}` : difference}</td>
                      <td>${team.points}</td>
                    </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        </section>`;
    })
    .join("");
}

function switchView(view) {
  state.view = view;
  $("matchesView").hidden = view !== "matches";
  $("standingsView").hidden = view !== "standings";
  $("poolSelector").hidden = false;
  $("simulationControl").hidden = view !== "standings";
  $("searchToggle").hidden = false;
  $("pageTitle").textContent = view === "matches" ? "PARTIDOS" : "POSICIONES";
  document
    .querySelectorAll(".main-tab")
    .forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  render();
}

function renderSimulationState() {
  $("simulationToggle").checked = state.simulation;
  $("simulationTitle").textContent = state.simulation
    ? "MODO SIMULACIÓN"
    : "MODO REAL";
  $("simulationHelp").textContent = state.simulation
    ? "Incluye tus pronósticos para partidos futuros"
    : "Solo resultados oficiales";
  $("simulationControl").classList.toggle("simulating", state.simulation);
}

function render() {
  renderPoolSelector();
  renderFilters();
  renderSimulationState();
  renderMatches();
  renderStandings();
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
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

document.querySelectorAll(".main-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});

$("filterTabs").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-filter]");
  if (!chip) return;
  if (state.view === "matches") state.matchFilter = chip.dataset.filter;
  else state.standingsFilter = chip.dataset.filter;
  lastAutoScrollTarget = "";
  render();
});

$("poolSelect").addEventListener("change", (event) => {
  state.selectedPoolId = event.target.value;
  render();
});

$("simulationToggle").addEventListener("change", (event) => {
  state.simulation = event.target.checked;
  render();
});

$("searchToggle").addEventListener("click", () => {
  $("searchBox").hidden = false;
  $("searchInput").focus();
});

$("searchClose").addEventListener("click", () => {
  state.search = "";
  $("searchInput").value = "";
  $("searchBox").hidden = true;
  render();
});

$("searchInput").addEventListener("input", (event) => {
  state.search = event.target.value;
  lastAutoScrollTarget = "";
  if (state.view === "matches") renderMatches();
  else renderStandings();
});

render();

observeMatches(
  MATCHES,
  (updatedMatches) => {
    MATCHES.splice(0, MATCHES.length, ...updatedMatches);
    render();
  },
  () => showToast("Sin conexión en vivo. Mostrando datos locales."),
);
