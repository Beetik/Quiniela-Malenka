import { MATCHES } from "./matches-data.js";
import { loadAppConfig, observeMatches } from "./firebase-service.js";
import { teamFlagMarkup } from "./team-flags.js";
import { formatLocalMatchDate, formatLocalMatchTime, matchTimestamp } from "./timezone-utils.js";

const LIST_KEY = "quinielaMalenka.saved";
const APP_CONFIG_CACHE_KEY = "quinielaMalenka.appConfig";
const KNOCKOUT_GROUPS = [
  "16avos de Final",
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinales",
  "Tercer Lugar",
  "Final",
];
const BRACKET_SOURCES_BY_NEXT_ID = {
  R16_1: ["R32_1", "R32_2"],
  R16_2: ["R32_3", "R32_4"],
  R16_3: ["R32_5", "R32_6"],
  R16_4: ["R32_7", "R32_8"],
  R16_5: ["R32_9", "R32_10"],
  R16_6: ["R32_11", "R32_12"],
  R16_7: ["R32_13", "R32_14"],
  R16_8: ["R32_15", "R32_16"],
  QF_1: ["R16_1", "R16_2"],
  QF_2: ["R16_3", "R16_4"],
  QF_3: ["R16_5", "R16_6"],
  QF_4: ["R16_7", "R16_8"],
  SF_1: ["QF_1", "QF_2"],
  SF_2: ["QF_3", "QF_4"],
  FIN: ["SF_1", "SF_2"],
  "3RD": ["SF_1", "SF_2"],
};
const BRACKET_MATCH_ORDER = [
  "R32_1",
  "R32_2",
  "R32_3",
  "R32_4",
  "R32_5",
  "R32_6",
  "R32_7",
  "R32_8",
  "R32_9",
  "R32_10",
  "R32_11",
  "R32_12",
  "R32_13",
  "R32_14",
  "R32_15",
  "R32_16",
  "R16_1",
  "R16_2",
  "R16_3",
  "R16_4",
  "R16_5",
  "R16_6",
  "R16_7",
  "R16_8",
  "QF_1",
  "QF_2",
  "QF_3",
  "QF_4",
  "SF_1",
  "SF_2",
  "3RD",
  "FIN",
];
const BRACKET_ORDER_INDEX = new Map(BRACKET_MATCH_ORDER.map((id, index) => [id, index]));
const GROUPS = [...new Set(MATCHES.map((match) => match.group))].sort();

const state = {
  view: "matches",
  matchFilter: "Todos",
  standingsFilter: "Todos",
  search: "",
  selectedPoolId: "",
  simulation: false,
  appConfig: readCachedAppConfig(),
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

function normalizeAppConfig(config = {}) {
  return {
    visibleGroups: Boolean(config?.visibleGroups ?? true),
    visibleFinal: Boolean(config?.visibleFinal ?? false),
  };
}

function readCachedAppConfig() {
  try {
    return normalizeAppConfig(JSON.parse(localStorage.getItem(APP_CONFIG_CACHE_KEY) || "null"));
  } catch {
    return normalizeAppConfig();
  }
}

function activePhaseIsKnockoutOnly() {
  return state.appConfig.visibleFinal && !state.appConfig.visibleGroups;
}

function standingsShowsBracket() {
  return (
    activePhaseIsKnockoutOnly() ||
    (state.standingsFilter !== "Todos" && KNOCKOUT_GROUPS.includes(state.standingsFilter))
  );
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

function formatDate(match) {
  return formatLocalMatchDate(match, { weekday: "long", month: "long" });
}

function dateLabel(match) {
  return formatLocalMatchDate(match, { month: "long" });
}

function timeLabel(match) {
  return formatLocalMatchTime(match);
}

function isLive(match) {
  return match.started && match.isActive;
}

function isFinished(match) {
  return match.finished && !match.isActive;
}

function isKnockoutMatch(match) {
  return KNOCKOUT_GROUPS.includes(match.group);
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
  let matches = [...MATCHES].sort((a, b) => matchTimestamp(a) - matchTimestamp(b));

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
  const standingsGroups = activePhaseIsKnockoutOnly()
    ? KNOCKOUT_GROUPS
    : GROUPS;
  const filters =
    state.view === "matches"
      ? ["Todos", secondaryFilter(), ...GROUPS]
      : ["Todos", ...standingsGroups];
  if (!filters.includes(active)) {
    if (state.view === "matches") state.matchFilter = "Todos";
    else state.standingsFilter = "Todos";
  }
  const normalizedActive =
    state.view === "matches" ? state.matchFilter : state.standingsFilter;

  $("filterTabs").innerHTML = filters
    .map(
      (filter) =>
        `<button class="filter-chip ${filter === normalizedActive ? "active" : ""}" data-filter="${filter}" type="button">${filter}</button>`,
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
  const venue = venueMarkup(match);
  const showVenueAboveTeams = match.started || isLive(match) || isFinished(match);

  return `
    <article class="match-card" data-match-id="${escapeHtml(match.id)}">
      <div class="match-meta">
        <span>${escapeHtml(match.group)} · ${dateLabel(match)}</span>
        <span>${timeLabel(match)} hrs</span>
      </div>
      ${showVenueAboveTeams ? venue : ""}
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
      ${showVenueAboveTeams ? "" : venue}
      ${penaltyMarkup(match)}
      ${scorersMarkup(match)}
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
  const showBracket = standingsShowsBracket();
  if (showBracket) {
    renderKnockoutStandings(query);
    return;
  }
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
    .filter((group) => !KNOCKOUT_GROUPS.includes(group))
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

function knockoutMatches() {
  return MATCHES.filter((match) => isKnockoutMatch(match)).sort(sortByBracketOrder);
}

function bracketOrder(match) {
  return BRACKET_ORDER_INDEX.get(match.id) ?? Number.MAX_SAFE_INTEGER;
}

function sortByBracketOrder(a, b) {
  return bracketOrder(a) - bracketOrder(b) || matchTimestamp(a) - matchTimestamp(b) || a.id.localeCompare(b.id);
}

function knockoutSelectedRound() {
  if (state.standingsFilter === "Octavos de Final") return "Octavos";
  if (state.standingsFilter === "Cuartos de Final") return "Cuartos";
  if (state.standingsFilter === "Semifinales") return "Semis";
  if (state.standingsFilter === "Final" || state.standingsFilter === "Tercer Lugar") return "Final";
  return "16avos";
}

function knockoutRoundTabs(selected) {
  const tabs = [
    ["16avos", "16AVOS", "16avos de Final"],
    ["Octavos", "OCTAVOS", "Octavos de Final"],
    ["Cuartos", "CUARTOS", "Cuartos de Final"],
    ["Semis", "SEMIFINALES", "Semifinales"],
    ["Final", "FINAL", "Final"],
  ];
  return `<div class="bracket-tabs">
    ${tabs
      .map(
        ([id, label, filter]) =>
          `<button class="${id === selected ? "active" : ""}" data-filter="${filter}" type="button">${label}</button>`,
      )
      .join("")}
  </div>`;
}

function matchResultForBracket(match) {
  return scoreForStandings(match);
}

function bracketPrediction(match) {
  const prediction = getPredictions()[match.id];
  if (!prediction || prediction.homeScore === "" || prediction.awayScore === "") return "";
  return `<div class="bracket-prediction"><span>Tú:</span><b>${escapeHtml(prediction.homeScore)} - ${escapeHtml(prediction.awayScore)}</b></div>`;
}

function bracketMatchCard(match) {
  const result = matchResultForBracket(match);
  const showScore = match.started || match.finished || Boolean(result);
  const homeScore = showScore ? result?.[0] ?? match.realHomeScore ?? 0 : "-";
  const awayScore = showScore ? result?.[1] ?? match.realAwayScore ?? 0 : "-";
  const round = match.group
    .replace(" de Final", "")
    .replace("Semifinales", "SEMIS")
    .replace("Tercer Lugar", "3ER LUGAR")
    .toUpperCase();
  return `<article class="bracket-card">
    <div class="bracket-card-meta"><b>${escapeHtml(round)}</b><span>${timeLabel(match)}</span></div>
    <div class="bracket-team">
      ${teamFlagMarkup(match.homeTeam, match.homeFlag, "bracket-flag")}
      <span>${escapeHtml(match.homeTeam)}</span>
      <b>${homeScore}</b>
    </div>
    <div class="bracket-team">
      ${teamFlagMarkup(match.awayTeam, match.awayFlag, "bracket-flag")}
      <span>${escapeHtml(match.awayTeam)}</span>
      <b>${awayScore}</b>
    </div>
    ${penaltyMarkup(match)}
    ${bracketPrediction(match)}
    <small>${dateLabel(match)}</small>
  </article>`;
}

function renderRoundList(matches, groupName) {
  const roundMatches = matches.filter((match) => match.group === groupName).sort(sortByBracketOrder);
  return `<div class="bracket-list">${roundMatches.map(bracketMatchCard).join("")}</div>`;
}

function renderTreeRound(matches, currentStage, nextStage) {
  const current = matches.filter((match) => match.group === currentStage).sort(sortByBracketOrder);
  const next = matches.filter((match) => match.group === nextStage).sort(sortByBracketOrder);
  if (!next.length) return renderRoundList(matches, currentStage);
  const currentById = new Map(current.map((match) => [match.id, match]));
  const mappedPairs = next
    .map((nextMatch) => {
      const sourceIds = BRACKET_SOURCES_BY_NEXT_ID[nextMatch.id];
      if (!sourceIds) return null;
      const sources = sourceIds.map((id) => currentById.get(id)).filter(Boolean);
      return sources.length ? { sources, nextMatch } : null;
    })
    .filter(Boolean);
  const pairs =
    mappedPairs.length === next.length
      ? mappedPairs
      : next.map((nextMatch, index) => ({
          sources: current.slice(index * 2, index * 2 + 2),
          nextMatch,
        }));
  return `<div class="bracket-tree">
    ${pairs
      .map(
        ({ sources, nextMatch }) => `<div class="bracket-pair">
          <div class="bracket-pair-current">${sources.map(bracketMatchCard).join("")}</div>
          <div class="bracket-connector" aria-hidden="true"></div>
          <div class="bracket-pair-next">${bracketMatchCard(nextMatch)}</div>
        </div>`,
      )
      .join("")}
  </div>`;
}

function knockoutWinnerTeam(match) {
  const result = matchResultForBracket(match);
  if (!match || !result || result[0] === result[1]) return null;
  return result[0] > result[1] ? match.homeTeam : match.awayTeam;
}

function renderFinalBracket(matches) {
  const finalMatch = matches.find((match) => match.id === "FIN");
  const thirdMatch = matches.find((match) => match.id === "3RD");
  return `<div class="bracket-final">
    ${finalMatch ? `<h3>FINAL</h3>${bracketMatchCard(finalMatch)}` : ""}
    ${thirdMatch ? `<h3>TERCER LUGAR</h3>${bracketMatchCard(thirdMatch)}` : ""}
  </div>`;
}

function renderKnockoutStandings(query = "") {
  const matches = knockoutMatches().filter(
    (match) =>
      !query ||
      normalizeText(`${match.homeTeam} ${match.awayTeam} ${match.group}`).includes(query),
  );
  if (!matches.length) {
    $("standingsView").innerHTML =
      '<div class="empty-state">No hay eliminatorias que coincidan con la búsqueda.</div>';
    return;
  }

  const selected = knockoutSelectedRound();
  const finalMatch = matches.find((match) => match.id === "FIN");
  const champion = knockoutWinnerTeam(finalMatch) || "Por definir";
  const content =
    selected === "Octavos"
      ? renderTreeRound(matches, "Octavos de Final", "Cuartos de Final")
      : selected === "Cuartos"
        ? renderTreeRound(matches, "Cuartos de Final", "Semifinales")
        : selected === "Semis"
          ? renderTreeRound(matches, "Semifinales", "Final")
          : selected === "Final"
            ? renderFinalBracket(matches)
            : renderTreeRound(matches, "16avos de Final", "Octavos de Final");

  $("standingsView").innerHTML = `
    <section class="bracket-section">
      ${knockoutRoundTabs(selected)}
      <div class="champion-card">
        <span>&#127942;</span>
        <div><b>CAMPEÓN</b><strong>${champion === "Por definir" ? "Por definir" : `${teamFlagMarkup(champion, "", "bracket-flag")} ${escapeHtml(champion)}`}</strong></div>
      </div>
      ${content}
      <p class="bracket-note">Las llaves se actualizan conforme avanzan los partidos reales.</p>
    </section>`;
}

function switchView(view) {
  state.view = view;
  $("matchesView").hidden = view !== "matches";
  $("standingsView").hidden = view !== "standings";
  $("poolSelector").hidden = false;
  $("simulationControl").hidden = view !== "standings" || standingsShowsBracket();
  $("searchToggle").hidden = false;
  $("pageTitle").textContent = view === "matches" ? "PARTIDOS" : "POSICIONES";
  document
    .querySelectorAll(".main-tab")
    .forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  render();
}

function renderSimulationState() {
  $("simulationControl").hidden = state.view !== "standings" || standingsShowsBracket();
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

$("standingsView").addEventListener("click", (event) => {
  const chip = event.target.closest(".bracket-tabs [data-filter]");
  if (!chip) return;
  state.standingsFilter = chip.dataset.filter;
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

async function refreshAppConfig() {
  try {
    state.appConfig = normalizeAppConfig(await loadAppConfig());
    localStorage.setItem(APP_CONFIG_CACHE_KEY, JSON.stringify(state.appConfig));
    render();
  } catch {
    state.appConfig = readCachedAppConfig();
  }
}

render();
refreshAppConfig();

observeMatches(
  MATCHES,
  (updatedMatches) => {
    MATCHES.splice(0, MATCHES.length, ...updatedMatches);
    render();
  },
  () => showToast("Sin conexión en vivo. Mostrando datos locales."),
);
