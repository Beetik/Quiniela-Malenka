import { MATCHES } from "./matches-data.js";
import {
  loadAppConfig,
  loadOfficialParticipants,
  observeMatches,
} from "./firebase-service.js";
import { teamFlagMarkup } from "./team-flags.js";

const POOLS_KEY = "quinielaMalenka.saved";
const USER_KEY = "quinielaMalenka.user";
const CONFIGS_KEY = "quinielaMalenka.rankingConfigs";
const ACTIVE_CONFIG_KEY = "quinielaMalenka.activeRankingConfig";
const APP_CONFIG_CACHE_KEY = "quinielaMalenka.appConfig";
const CATEGORY_COLORS = {
  1: "#ffd700",
  2: "#2196f3",
  3: "#9c27b0",
  4: "#4caf50",
  5: "#ff4081",
};
const DEFAULT_CATEGORIES = {
  1: "Amigos",
  2: "Familia",
  3: "Trabajo",
  4: "Némesis",
  5: "Afectados",
};
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
const GROUPS = [...new Set(MATCHES.filter((match) => match.group.startsWith("Grupo")).map((match) => match.group))];
const DATES = [...new Set(MATCHES.map((match) => match.date))].sort();

const state = {
  view: "table",
  filter: "Todas",
  query: "",
  rankingFilter: "TOP_5",
  selectedDate: nearestDate(),
  dayOnly: false,
  dialogMatchId: null,
  participantDialogId: null,
  config: null,
  appConfig: readCachedAppConfig(),
};

const $ = (id) => document.getElementById(id);
let cloudParticipants = [];
let cloudParticipantsLoaded = false;

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "") ?? fallback;
  } catch {
    return fallback;
  }
}

function readCachedAppConfig() {
  const cached = parseJson(localStorage.getItem(APP_CONFIG_CACHE_KEY), null);
  return normalizeAppConfig(cached);
}

function normalizeAppConfig(config = {}) {
  return {
    faseGrupos: Boolean(config?.faseGrupos ?? true),
    faseFinal: Boolean(config?.faseFinal ?? true),
    visibleGroups: Boolean(config?.visibleGroups ?? true),
    visibleFinal: Boolean(config?.visibleFinal ?? false),
  };
}

function activePhase() {
  return state.appConfig.visibleFinal ? "knockout" : "groups";
}

function activePhaseLabel() {
  return activePhase() === "knockout" ? "Fase final" : "Fase de grupos";
}

function isKnockoutMatch(match) {
  return KNOCKOUT_GROUPS.includes(match.group);
}

function activeMatches() {
  if (activePhase() === "groups" && !state.appConfig.visibleGroups) return [];
  return MATCHES.filter((match) =>
    activePhase() === "knockout" ? isKnockoutMatch(match) : match.group.startsWith("Grupo"),
  );
}

function activeGroups() {
  if (activePhase() !== "groups") return [];
  return [...new Set(activeMatches().map((match) => match.group))];
}

function activeDates() {
  return [...new Set(activeMatches().map((match) => match.date))].sort();
}

function ensureSelectedDateInActivePhase() {
  const dates = activeDates();
  if (dates.length && !dates.includes(state.selectedDate)) {
    state.selectedDate = nearestDate(dates);
  }
}

function getPools() {
  const pools = parseJson(localStorage.getItem(POOLS_KEY), []);
  return Array.isArray(pools) ? pools : [];
}

function getUser() {
  return parseJson(localStorage.getItem(USER_KEY), null);
}

function defaultConfig() {
  return {
    id: "default",
    configName: "Configuración predeterminada",
    simulations: {},
    addedPoolIds: [],
    pinnedParticipantCategories: {},
    pinnedParticipantIds: [],
    categoryNames: { ...DEFAULT_CATEGORIES },
    isLiveRanking: false,
    comparisonParticipantId: null,
  };
}

function getConfigs() {
  const configs = parseJson(localStorage.getItem(CONFIGS_KEY), []);
  if (!Array.isArray(configs) || !configs.length) {
    const initial = [defaultConfig()];
    localStorage.setItem(CONFIGS_KEY, JSON.stringify(initial));
    return initial;
  }
  return configs;
}

function loadActiveConfig() {
  const configs = getConfigs();
  const activeId = localStorage.getItem(ACTIVE_CONFIG_KEY) || "default";
  state.config = configs.find((config) => config.id === activeId) || configs[0];
  normalizeConfig();
}

function normalizeConfig() {
  state.config = {
    ...defaultConfig(),
    ...state.config,
    simulations: state.config?.simulations || {},
    addedPoolIds: state.config?.addedPoolIds || [],
    pinnedParticipantCategories: state.config?.pinnedParticipantCategories || {},
    pinnedParticipantIds: state.config?.pinnedParticipantIds || [],
    categoryNames: { ...DEFAULT_CATEGORIES, ...(state.config?.categoryNames || {}) },
  };
  const existingIds = new Set(getPools().map((pool) => String(pool.id)));
  state.config.addedPoolIds = state.config.addedPoolIds.filter((id) =>
    existingIds.has(String(id)),
  );
}

function saveConfig() {
  const configs = getConfigs();
  const index = configs.findIndex((config) => config.id === state.config.id);
  if (index >= 0) configs[index] = state.config;
  else configs.push(state.config);
  localStorage.setItem(CONFIGS_KEY, JSON.stringify(configs));
  localStorage.setItem(ACTIVE_CONFIG_KEY, state.config.id);
}

function poolToParticipant(pool, loaded) {
  const user = getUser();
  const rawPredictions = parseJson(pool.resultsJson, {});
  const predictions = Object.fromEntries(
    Object.entries(rawPredictions)
      .filter(([, score]) => score?.homeScore !== "" && score?.awayScore !== "")
      .map(([id, score]) => [id, [Number(score.homeScore), Number(score.awayScore)]]),
  );
  return {
    id: loaded ? `loaded_${pool.id}` : `official_${pool.id}`,
    poolId: String(pool.id),
    quinielaName: pool.quinielaName || "Sin nombre",
    ownerName: pool.propietarioName || "Anónimo",
    isUser:
      normalizeEmail(pool.userEmail) !== "" &&
      normalizeEmail(pool.userEmail) === normalizeEmail(user?.email),
    loaded,
    isKnockout: Boolean(pool.isKnockout),
    predictions,
    winners: parseJson(pool.winnersJson, {}),
  };
}

function participants() {
  const pools = getPools();
  const phaseIsKnockout = activePhase() === "knockout";
  const official = cloudParticipantsLoaded
    ? cloudParticipants
    : pools.filter((pool) => pool.isSent).map((pool) => poolToParticipant(pool, false));
  const officialForPhase = official.filter(
    (participant) => Boolean(participant.isKnockout) === phaseIsKnockout,
  );
  const officialPoolIds = new Set(officialForPhase.map((participant) => participant.poolId));
  const added = state.config.addedPoolIds
    .map((id) => pools.find((pool) => String(pool.id) === String(id)))
    .filter(Boolean)
    .filter((pool) => Boolean(pool.isKnockout) === phaseIsKnockout)
    .filter((pool) => !officialPoolIds.has(String(pool.id)))
    .map((pool) => poolToParticipant(pool, true));
  return [...officialForPhase, ...added];
}

function cloudToParticipant(item) {
  const user = getUser();
  const predictions = Object.fromEntries(
    Object.entries(item.results || {}).map(([id, score]) => [
      id,
      [Number(score?.homeScore || 0), Number(score?.awayScore || 0)],
    ]),
  );
  return {
    id: item.id,
    poolId: item.id,
    quinielaName: item.quinielaName || "Sin nombre",
    ownerName: item.propietarioName || "Anónimo",
    isUser:
      normalizeEmail(item.userEmail) !== "" &&
      normalizeEmail(item.userEmail) === normalizeEmail(user?.email),
    loaded: false,
    isKnockout: Boolean(item.isKnockout),
    predictions,
    winners: { ...(item.groupWinners || {}), ...(item.winners || {}) },
  };
}

async function refreshOfficialParticipants() {
  const accessCode = getUser()?.accessCode || "";
  if (!accessCode.trim()) {
    cloudParticipants = [];
    cloudParticipantsLoaded = true;
    render();
    return;
  }
  try {
    const items = await loadOfficialParticipants(accessCode);
    cloudParticipants = items.map(cloudToParticipant);
    cloudParticipantsLoaded = true;
    render();
  } catch {
    cloudParticipantsLoaded = false;
    showToast("No se pudo cargar el ranking en nube. Usando datos locales.");
    render();
  }
}

async function refreshAppConfig() {
  try {
    state.appConfig = normalizeAppConfig(await loadAppConfig());
    localStorage.setItem(APP_CONFIG_CACHE_KEY, JSON.stringify(state.appConfig));
    render();
  } catch {
    state.appConfig = readCachedAppConfig();
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function confirmedIds() {
  return new Set(
    MATCHES.filter(
      (match) =>
        match.finished &&
        match.realHomeScore != null &&
        match.realAwayScore != null,
    ).map((match) => match.id),
  );
}

function officialScore(match) {
  if (
    (match.started || match.finished) &&
    match.realHomeScore != null &&
    match.realAwayScore != null
  ) {
    return [Number(match.realHomeScore), Number(match.realAwayScore)];
  }
  return null;
}

function simulationScore(match) {
  const score = state.config.simulations[match.id];
  return score ? [Number(score.home), Number(score.away)] : null;
}

function effectiveScore(match) {
  if (confirmedIds().has(match.id)) return officialScore(match);
  const simulation = simulationScore(match);
  if (simulation) return simulation;
  return officialScore(match);
}

function baseScore(match) {
  return confirmedIds().has(match.id) ? officialScore(match) : null;
}

function pointValue(prediction, actual) {
  if (!prediction || !actual) return 0;
  if (prediction[0] === actual[0] && prediction[1] === actual[1]) return 2;
  const predictedResult = Math.sign(prediction[0] - prediction[1]);
  const actualResult = Math.sign(actual[0] - actual[1]);
  return predictedResult === actualResult ? 1 : 0;
}

function knockoutWinner(roundName, scoreResolver) {
  const match = MATCHES.find((item) => item.group === roundName);
  const score = match ? scoreResolver(match) : null;
  if (!match || !score || score[0] === score[1]) return null;
  return score[0] > score[1] ? match.homeTeam : match.awayTeam;
}

function knockoutWinnerPointValue(roundName) {
  return KNOCKOUT_WINNER_POINTS[roundName] || 0;
}

function groupWinner(groupName, scoreResolver) {
  const groupMatches = MATCHES.filter((match) => match.group === groupName);
  const table = new Map();
  const goals = new Map();
  let hasResult = false;

  groupMatches.forEach((match) => {
    const score = scoreResolver(match);
    if (!score) return;
    hasResult = true;
    const [home, away] = score;
    goals.set(match.homeTeam, (goals.get(match.homeTeam) || 0) + home);
    goals.set(match.awayTeam, (goals.get(match.awayTeam) || 0) + away);
    if (home > away) table.set(match.homeTeam, (table.get(match.homeTeam) || 0) + 3);
    else if (home < away) table.set(match.awayTeam, (table.get(match.awayTeam) || 0) + 3);
    else {
      table.set(match.homeTeam, (table.get(match.homeTeam) || 0) + 1);
      table.set(match.awayTeam, (table.get(match.awayTeam) || 0) + 1);
    }
  });

  if (!hasResult) return null;
  const teams = [...new Set(groupMatches.flatMap((match) => [match.homeTeam, match.awayTeam]))];
  return teams.sort(
    (a, b) =>
      (table.get(b) || 0) - (table.get(a) || 0) ||
      (goals.get(b) || 0) - (goals.get(a) || 0),
  )[0];
}

function calculateScores(list, resolver, includeLiveGroups, matchScope = activeMatches()) {
  const scopeIds = new Set(matchScope.map((match) => match.id));
  const scopedGroups = activeGroups();
  return Object.fromEntries(
    list.map((participant) => {
      let points = 0;
      matchScope.forEach((match) => {
        points += pointValue(participant.predictions[match.id], resolver(match));
      });

      scopedGroups.forEach((group) => {
        const groupMatches = MATCHES.filter((match) => match.group === group);
        const scopedGroup = groupMatches.filter((match) => scopeIds.has(match.id));
        if (!scopedGroup.length) return;
        const hasResults = scopedGroup.some((match) => resolver(match));
        const finished = groupMatches.every((match) => resolver(match));
        if (hasResults && (finished || includeLiveGroups)) {
          const winner = groupWinner(group, resolver);
          if (winner && participant.winners[group] === winner) points += 2;
        }
      });
      if (activePhase() === "knockout") {
        Object.keys(KNOCKOUT_WINNER_POINTS).forEach((round) => {
          const winner = knockoutWinner(round, resolver);
          if (winner && participant.winners[round] === winner) {
            points += knockoutWinnerPointValue(round);
          }
        });
      }
      return [participant.id, points];
    }),
  );
}

function denseRanks(list, scores, addedOnly = false) {
  const official = list.filter((participant) => !participant.loaded);
  const rankingPool = addedOnly ? list.filter((participant) => participant.loaded) : official;
  const distinct = [...new Set(rankingPool.map((participant) => scores[participant.id] || 0))]
    .sort((a, b) => b - a);
  const rankMap = {};
  rankingPool.forEach((participant) => {
    rankMap[participant.id] = distinct.indexOf(scores[participant.id] || 0) + 1;
  });

  if (!addedOnly) {
    list.filter((participant) => participant.loaded).forEach((participant) => {
      const score = scores[participant.id] || 0;
      const matchingScore = distinct.find((officialScoreValue) => officialScoreValue <= score);
      rankMap[participant.id] =
        matchingScore == null ? distinct.length + 1 : distinct.indexOf(matchingScore) + 1;
    });
  }
  return rankMap;
}

function rankingData(list = participants(), matchScope = activeMatches()) {
  const currentScores = calculateScores(
    list,
    effectiveScore,
    state.config.isLiveRanking,
    matchScope,
  );
  const baseScores = calculateScores(list, baseScore, false, matchScope);
  const addedOnly = state.filter === "Añadidas";
  return {
    currentScores,
    baseScores,
    currentRanks: denseRanks(list, currentScores, addedOnly),
    baseRanks: denseRanks(list, baseScores, addedOnly),
  };
}

function historicalRanksByMatch(list, sortedMatches) {
  const runningScores = Object.fromEntries(
    list.map((participant) => [participant.id, 0]),
  );
  const officialParticipants = list.filter((participant) => !participant.loaded);
  const history = {};

  sortedMatches.forEach((match) => {
    const result = effectiveScore(match);
    if (!result) return;

    list.forEach((participant) => {
      runningScores[participant.id] += pointValue(
        participant.predictions[match.id],
        result,
      );
    });

    const groupMatches = sortedMatches.filter(
      (groupMatch) => groupMatch.group === match.group,
    );
    const isLastGroupMatch = groupMatches.at(-1)?.id === match.id;
    const groupFinished = groupMatches.every((groupMatch) =>
      effectiveScore(groupMatch),
    );
    if (isLastGroupMatch && groupFinished) {
      if (activeGroups().includes(match.group)) {
        const winner = groupWinner(match.group, effectiveScore);
        if (winner) {
          list.forEach((participant) => {
            if (participant.winners[match.group] === winner) {
              runningScores[participant.id] += 2;
            }
          });
        }
      }
    }

    if (activePhase() === "knockout" && knockoutWinnerPointValue(match.group) > 0) {
      const winner = knockoutWinner(match.group, effectiveScore);
      if (winner) {
        list.forEach((participant) => {
          if (participant.winners[match.group] === winner) {
            runningScores[participant.id] += knockoutWinnerPointValue(match.group);
          }
        });
      }
    }

    const officialPoints = [
      ...new Set(
        officialParticipants.map(
          (participant) => runningScores[participant.id] || 0,
        ),
      ),
    ].sort((a, b) => b - a);
    const ranks = {};

    officialParticipants.forEach((participant) => {
      ranks[participant.id] =
        officialPoints.indexOf(runningScores[participant.id] || 0) + 1;
    });
    list
      .filter((participant) => participant.loaded)
      .forEach((participant) => {
        const points = runningScores[participant.id] || 0;
        const comparable = officialPoints.find(
          (officialScore) => officialScore <= points,
        );
        ranks[participant.id] =
          comparable == null
            ? officialPoints.length + 1
            : officialPoints.indexOf(comparable) + 1;
      });

    history[match.id] = ranks;
  });

  return history;
}

function orderedParticipants() {
  const list = participants();
  const data = rankingData(list);
  const users = list.filter((participant) => participant.isUser);
  const loaded = list.filter((participant) => participant.loaded && !participant.isUser);
  const others = list.filter((participant) => !participant.loaded && !participant.isUser);
  const pinnedIds = state.config.pinnedParticipantIds;
  const categoryMap = state.config.pinnedParticipantCategories;
  const pinned = (items) =>
    items
      .filter((participant) => categoryMap[participant.id])
      .sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
  const unpinned = (items) => items.filter((participant) => !categoryMap[participant.id]);
  let result = [...pinned(loaded), ...unpinned(loaded), ...users, ...pinned(others), ...unpinned(others)];

  if (state.filter === "Añadidas") {
    result = loaded.sort(
      (a, b) =>
        (data.currentScores[b.id] || 0) - (data.currentScores[a.id] || 0) ||
        a.quinielaName.localeCompare(b.quinielaName),
    );
  } else if (state.filter === "Top 5" || state.filter === "Top 10") {
    const count = state.filter === "Top 5" ? 5 : 10;
    const topOthers = others
      .sort((a, b) => (data.currentScores[b.id] || 0) - (data.currentScores[a.id] || 0))
      .slice(0, count);
    result = [...users, ...loaded, ...topOthers];
  } else if (!["Todas", "Top 5", "Top 10", "Añadidas"].includes(state.filter)) {
    const categoryId = Object.entries(state.config.categoryNames).find(
      ([, name]) => name === state.filter,
    )?.[0];
    const categoryParticipants = list
      .filter((participant) => String(categoryMap[participant.id]) === String(categoryId))
      .sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
    result = [
      ...loaded.filter((participant) => !categoryMap[participant.id]),
      ...users.filter((participant) => !categoryMap[participant.id]),
      ...categoryParticipants,
    ];
  }

  const query = normalizeText(state.query);
  if (query) {
    result = result.filter((participant) =>
      normalizeText(`${participant.quinielaName} ${participant.ownerName}`).includes(query),
    );
  }
  return [...new Map(result.map((participant) => [participant.id, participant])).values()];
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function nearestDate(dates = DATES) {
  const today = Date.now();
  return (
    dates.map((date) => ({
      date,
      distance: Math.abs(new Date(`${date}T12:00:00-06:00`).getTime() - today),
    })).sort((a, b) => a.distance - b.distance)[0]?.date || dates[0] || DATES[0]
  );
}

function formatDate(date) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: "America/Mexico_City",
  })
    .format(new Date(`${date}T12:00:00-06:00`))
    .replace(".", "")
    .replace(" de ", " ");
}

function formatCardDate(date) {
  const formatted = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "America/Mexico_City",
  })
    .format(new Date(`${date}T12:00:00-06:00`))
    .replace(".", "")
    .replace(",", "");
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function isDateFinished(date) {
  const matches = activeMatches().filter((match) => match.date === date);
  return (
    matches.length > 0 &&
    matches.every((match) => match.finished && !match.isActive)
  );
}

function renderToolbar() {
  $("configName").textContent = `${activePhaseLabel()} · ${state.config.configName}`;
  $("liveToggle").checked = state.config.isLiveRanking;
  $("liveToggle").closest(".live-control").hidden = activePhase() === "knockout";
  document.querySelectorAll(".view-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === state.view);
  });

  const usedCategoryIds = new Set(
    Object.values(state.config.pinnedParticipantCategories).map(String),
  );
  const categoryOptions = Object.entries(state.config.categoryNames)
    .filter(([id]) => usedCategoryIds.has(String(id)))
    .map(([, name]) => name);
  const hasAdded = participants().some((participant) => participant.loaded);
  const options = ["Todas", "Top 10", "Top 5", ...(hasAdded ? ["Añadidas"] : []), ...categoryOptions];
  if (!options.includes(state.filter)) state.filter = "Todas";
  $("filterSelect").innerHTML = options
    .map(
      (option) =>
        `<option value="${escapeHtml(option)}" ${option === state.filter ? "selected" : ""}>${escapeHtml(option)}</option>`,
    )
    .join("");
}

function render() {
  normalizeConfig();
  ensureSelectedDateInActivePhase();
  renderToolbar();
  ["table", "cards", "ranking"].forEach((view) => {
    $(`${view}View`).hidden = state.view !== view;
  });
  renderTable();
  renderCards();
  renderGlobalRanking();
}

function renderEmpty(action = true) {
  return `<div class="empty-state"><div><p>No hay quinielas participantes de ${activePhaseLabel().toLowerCase()}.</p>${
    action ? '<button class="open-load" type="button">Añadir quinielas guardadas</button>' : ""
  }</div></div>`;
}

function renderTable() {
  const list = orderedParticipants();
  if (!list.length) {
    $("tableView").innerHTML = renderEmpty();
    return;
  }
  const tableMatches = [...activeMatches()].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      a.id.localeCompare(b.id),
  );
  const matchHistoryRanks = historicalRanksByMatch(
    participants(),
    tableMatches,
  );
  const data = rankingData(participants(), tableMatches);
  const winnerRows = (
    activePhase() === "knockout"
      ? Object.keys(KNOCKOUT_WINNER_POINTS).map((round) => {
          const winner = knockoutWinner(round, effectiveScore);
          const pointsActive = Boolean(winner);
          const pointValue = knockoutWinnerPointValue(round);
          const label = round === "Final" ? "Campeón" : "3er Lugar";
          return `<tr>
            <td><div class="match-label group-label"><span>&#127942;</span><b>${label}</b><span class="group-leader-flag">${winner ? teamFlag(winner) : ""}</span></div></td>
            ${list
              .map((participant) => {
                const team = participant.winners[round] || "-";
                const correct = pointsActive && team === winner;
                return `<td>${team === "-" ? "-" : teamFlag(team)}${pointsActive ? pointTag(correct ? pointValue : 0) : ""}</td>`;
              })
              .join("")}
          </tr>`;
        })
      : activeGroups().map((group) => {
          const winner = groupWinner(group, effectiveScore);
          const compactGroup = group.replace(/^Grupo\s+/i, "Gpo ");
          const leaderFlag = winner ? teamFlag(winner) : "";
          const groupFinished = MATCHES.filter((match) => match.group === group).every((match) =>
            effectiveScore(match),
          );
          const groupPointsActive = Boolean(winner) && (groupFinished || state.config.isLiveRanking);
          return `<tr>
            <td><div class="match-label group-label"><span>&#127942;</span><b>${compactGroup}</b><span class="group-leader-flag">${leaderFlag}</span></div></td>
            ${list
              .map((participant) => {
                const team = participant.winners[group] || "-";
                const correct = groupPointsActive && team === winner;
                return `<td>${team === "-" ? "-" : teamFlag(team)}${
                  groupPointsActive ? pointTag(correct ? 2 : 0) : ""
                }</td>`;
              })
              .join("")}
          </tr>`;
        })
  ).join("");

  $("tableView").innerHTML = `
    <div class="table-shell">
      <table class="ranking-matrix">
        <thead>
          <tr class="participant-header-row">
            <th>Partido</th>
            ${list.map(participantHeader).join("")}
          </tr>
          <tr class="summary-position-row">
            <th><b>Posición</b></th>
            ${list
              .map(
                (participant) =>
                  `<th>${rankBadge(data.currentRanks[participant.id] || 1, participant.loaded)}</th>`,
              )
              .join("")}
          </tr>
          <tr class="summary-points-row">
            <th><b>Puntos</b></th>
            ${list
              .map(
                (participant) =>
                  `<th><b>${data.currentScores[participant.id] || 0}</b></th>`,
              )
              .join("")}
          </tr>
        </thead>
        <tbody>
          ${tableMatches.map(
            (match) => {
              const confirmed = confirmedIds().has(match.id);
              const simulated = !confirmed && Boolean(simulationScore(match));
              const live =
                !confirmed &&
                !simulated &&
                match.started &&
                match.isActive &&
                Boolean(officialScore(match));
              const resultClass = confirmed
                ? "official-result"
                : simulated
                  ? "simulated-result"
                  : live
                    ? "live-result"
                    : "";
              return `<tr>
              <td>
                <div class="match-label">
                  <span class="flag-pair">${matchFlags(match)}</span>
                  ${
                    confirmed
                      ? `<b class="${resultClass}">${scoreText(effectiveScore(match), "-")}</b>`
                      : match.started
                        ? `<button class="score-trigger edit-score ${resultClass}" data-match-id="${match.id}" type="button" aria-label="Editar marcador de ${escapeHtml(match.homeTeam)} contra ${escapeHtml(match.awayTeam)}">${scoreText(effectiveScore(match), "-")}</button>`
                        : `${inlineScoreEditor(match, "table-inline-score")}<button class="score-trigger edit-score mobile-score-trigger ${resultClass}" data-match-id="${match.id}" type="button" aria-label="Editar marcador de ${escapeHtml(match.homeTeam)} contra ${escapeHtml(match.awayTeam)}">${scoreText(effectiveScore(match), "-")}</button>`
                  }
                </div>
              </td>
              ${list
                .map((participant) => {
                  const prediction = participant.predictions[match.id];
                  const points = pointValue(prediction, effectiveScore(match));
                  const historicalRank =
                    matchHistoryRanks[match.id]?.[participant.id];
                  const rankClass =
                    historicalRank === 1
                      ? " historical-first"
                      : historicalRank === 2
                        ? " historical-second"
                        : "";
                  return `<td class="${rankClass.trim()}">${prediction ? prediction.join("-") : "-"}${
                    effectiveScore(match) ? pointTag(points) : ""
                  }</td>`;
                })
                .join("")}
            </tr>`;
            },
          ).join("")}
          ${winnerRows}
        </tbody>
      </table>
    </div>`;
}

function participantHeader(participant) {
  const categoryId = state.config.pinnedParticipantCategories[participant.id];
  const pinned = Boolean(categoryId);
  const comparison = state.config.comparisonParticipantId === participant.id;
  const classes = [
    "participant-head",
    participant.isUser ? "user" : "",
    participant.loaded ? "loaded" : "",
    pinned ? "pinned" : "",
    comparison ? "comparison" : "",
  ].join(" ");
  return `<th>
    <button class="${classes}" style="--category:${CATEGORY_COLORS[categoryId] || "#777"}" data-participant-id="${participant.id}" type="button">
      <span class="avatar">${escapeHtml(participant.ownerName.charAt(0).toUpperCase() || "?")}</span>
      <span>${escapeHtml(participant.quinielaName)}</span>
      <small>(${escapeHtml(participant.ownerName)})</small>
    </button>
  </th>`;
}

function pointTag(points) {
  return `<span class="point-tag point-${points}">+${points}</span>`;
}

function rankBadge(rank, loaded) {
  const cls = rank === 1 ? "first" : rank === 2 ? "second" : loaded ? "loaded" : "";
  return `<span class="rank-badge ${cls}">${rank}&deg;</span>`;
}

function renderCards() {
  const allParticipants = participants();
  const list = orderedParticipants();
  const phaseMatches = activeMatches();
  const dates = activeDates();
  const dayMatches = phaseMatches.filter(
    (match) => match.date === state.selectedDate,
  ).sort(
    (a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id),
  );
  const scope = state.dayOnly
    ? dayMatches
    : phaseMatches.filter((match) => match.date <= state.selectedDate);
  const data = rankingData(allParticipants, scope);
  const simulatedDates = new Set(
    phaseMatches.filter((match) => simulationScore(match)).map((match) => match.date),
  );
  const officialParticipants = allParticipants.filter(
    (participant) => !participant.loaded,
  );
  const todayGroups = [...new Set(dayMatches.map((match) => match.group))].sort();
  const currentWinners = Object.fromEntries(
    todayGroups.map((group) => [
      group,
      activePhase() === "knockout" ? knockoutWinner(group, effectiveScore) : groupWinner(group, effectiveScore),
    ]),
  );
  const groupPointsActive = Object.fromEntries(
    todayGroups.map((group) => {
      const groupMatches = MATCHES.filter((match) => match.group === group);
      const hasResults = groupMatches.some((match) => effectiveScore(match));
      const finished = groupMatches.every((match) => effectiveScore(match));
      return [
        group,
        hasResults &&
          (activePhase() === "knockout"
            ? knockoutWinnerPointValue(group) > 0
            : finished || state.config.isLiveRanking),
      ];
    }),
  );

  $("cardsView").innerHTML = `
    <div class="cards-options">
      <div class="date-strip">
        ${dates.map(
          (date) => {
            const classes = [
              "date-chip",
              date === state.selectedDate ? "active" : "",
              simulatedDates.has(date) ? "simulated" : "",
              hasLiveOnDate(date) ? "live" : "",
              isDateFinished(date) ? "finished" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return `<button class="${classes}" data-date="${date}" type="button">${formatCardDate(date)}</button>`;
          },
        ).join("")}
      </div>
    </div>
    <div class="match-strip">
      ${dayMatches.map((match) => matchCard(match, officialParticipants)).join("")}
      ${renderTodayLeaders(dayMatches, allParticipants)}
    </div>
    <div class="section-title">
      <h2>PARTICIPANTES Y PRONÓSTICOS</h2>
      <button id="dayOnlyBtn" class="day-toggle ${state.dayOnly ? "active" : ""}" type="button">
        ${state.dayOnly ? "Puntos del día" : "Acumulado"}
      </button>
    </div>
    <div class="participant-strip">
      <button class="add-card open-load" type="button">+<br />Cargar<br />Quiniela</button>
      ${
        list.length
          ? list
              .map(
                (participant) => `<article class="participant-card ${
                  state.config.comparisonParticipantId === participant.id ? "comparison" : ""
                }">
                  <button class="participant-head ${participant.loaded ? "loaded" : ""}" data-participant-id="${participant.id}" type="button">
                    <h3>${escapeHtml(participant.quinielaName)}</h3>
                    <p>${escapeHtml(participant.ownerName)}</p>
                  </button>
                  ${winnerPredictionStrip(participant, todayGroups, currentWinners, groupPointsActive)}
                  <div class="card-score">
                    <div><strong>#${data.currentRanks[participant.id] || 1}</strong><p>ranking</p></div>
                    <b>${data.currentScores[participant.id] || 0} pts</b>
                  </div>
                  <div class="prediction-list">
                    ${dayMatches.map((match) => predictionRow(participant, match)).join("")}
                  </div>
                </article>`,
              )
              .join("")
          : ""
      }
    </div>`;
}

function renderTodayLeaders(dayMatches, list) {
  if (!dayMatches.length) return "";
  const groups = [...new Set(dayMatches.map((match) => match.group))].sort();

  return `<article class="today-leaders-card">
    <div class="today-leaders-title">
      <span aria-hidden="true">&#127942;</span>
      <b>LÍDERES HOY</b>
    </div>
    <div class="today-leaders-list">
      ${groups
        .map((group) => {
          const winner = activePhase() === "knockout" ? knockoutWinner(group, effectiveScore) : groupWinner(group, effectiveScore);
          const predictions = winner
            ? list.filter(
                (participant) => participant.winners[group] === winner,
              ).length
            : 0;
          return `<div class="today-leader-row">
            <b>${group.replace(/^Grupo\s+/i, "")}</b>
            <span class="today-leader-flag">${winner ? teamFlag(winner) : ""}</span>
            <small>${winner ? `(${predictions})` : ""}</small>
          </div>`;
        })
        .join("")}
    </div>
  </article>`;
}

function hasLiveOnDate(date) {
  return activeMatches().some(
    (match) => match.date === date && match.started && match.isActive,
  );
}

function winnerPredictionStrip(
  participant,
  todayGroups,
  currentWinners,
  groupPointsActive,
) {
  const badges = todayGroups
    .map((group) => {
      const predictedTeam = participant.winners[group];
      if (!predictedTeam) return "";
      const active = groupPointsActive[group];
      const correct = active && currentWinners[group] === predictedTeam;
      return `<span class="winner-prediction" title="${escapeHtml(group)}">
        <span>${teamFlag(predictedTeam)}</span>
        ${active ? `<i class="${correct ? "correct" : ""}"></i>` : ""}
      </span>`;
    })
    .join("");
  return badges ? `<div class="winner-predictions">${badges}</div>` : "";
}

function predictionRow(participant, match) {
  const prediction = participant.predictions[match.id];
  const actual = effectiveScore(match);
  const points = pointValue(prediction, actual);
  return `<div class="prediction-row">
    <span class="flag-pair">${matchFlags(match)}</span>
    ${actual && prediction ? pointTag(points) : "<i></i>"}
    <b>${prediction ? prediction.join("-") : "-"}</b>
  </div>`;
}

function matchPointStats(match, officialParticipants) {
  const actual = effectiveScore(match);
  if (!actual) return null;
  return officialParticipants.reduce(
    (counts, participant) => {
      const points = pointValue(participant.predictions[match.id], actual);
      counts[points] += 1;
      return counts;
    },
    { 0: 0, 1: 0, 2: 0 },
  );
}

function statLabel(points, count) {
  return `<span class="match-stat point-${points}"><i></i>${count}</span>`;
}

function matchCard(match, officialParticipants = []) {
  const actual = effectiveScore(match);
  const confirmed = confirmedIds().has(match.id);
  const simulated = !confirmed && Boolean(simulationScore(match));
  const live = match.started && match.isActive && !simulated;
  const stats = matchPointStats(match, officialParticipants);
  const cls = simulated ? "simulated" : live ? "live" : confirmed ? "confirmed" : "";
  const status = simulated
    ? "Simulado"
    : live
      ? "En vivo"
      : confirmed
        ? "Finalizado"
        : "Programado";
  const editableBeforeStart = !confirmed && !match.started;
  return `<article class="match-card ${cls}">
    <small>${match.group} &middot; ${match.time}</small>
    <div class="flags">${teamFlagMarkup(match.homeTeam, match.homeFlag, "card-flag")} VS ${teamFlagMarkup(match.awayTeam, match.awayFlag, "card-flag")}</div>
    <span>${status}</span>
    ${
      editableBeforeStart
        ? inlineScoreEditor(match, "card-inline-score")
        : `<div class="score">${scoreText(actual, "-")}</div>`
    }
    ${
      stats
        ? `<div class="match-stats">
            ${statLabel(2, stats[2])}
            ${statLabel(1, stats[1])}
            ${statLabel(0, stats[0])}
          </div>`
        : ""
    }
    ${
      simulated
        ? `<button class="small-btn ghost-btn clear-match-simulation" data-clear-match-id="${match.id}" type="button">${match.started && match.isActive ? "Volver a vivo" : "Borrar sim"}</button>`
        : ""
    }
    ${
      confirmed || editableBeforeStart
        ? ""
        : `<button class="small-btn edit-score" data-match-id="${match.id}" type="button">Simular</button>`
    }
    ${
      editableBeforeStart
        ? `<button class="small-btn edit-score mobile-score-trigger" data-match-id="${match.id}" type="button">Simular</button>`
        : ""
    }
  </article>`;
}

function renderGlobalRanking() {
  const list = participants().filter((participant) => !participant.loaded);
  if (!list.length) {
    $("rankingView").innerHTML = renderEmpty();
    return;
  }
  const featured = featuredMatches();
  const currentScores = calculateRankingScopeScores(list, featured, true);
  const baseScores = calculateRankingScopeScores(list, featured, false);
  const currentRanks = denseRanks(list, currentScores, false);
  const baseRanks = denseRanks(list, baseScores, false);
  const sorted = [...list].sort(
    (a, b) =>
      (currentRanks[a.id] || 999) - (currentRanks[b.id] || 999) ||
      (currentScores[b.id] || 0) - (currentScores[a.id] || 0),
  );
  const displayParticipants = rankingDisplayParticipants(sorted);
  const movement = sorted.map((participant) => ({
    participant,
    delta: (baseRanks[participant.id] || currentRanks[participant.id] || 1) -
      (currentRanks[participant.id] || 1),
    pointsDelta: (currentScores[participant.id] || 0) - (baseScores[participant.id] || 0),
  }));
  const rankUps = movement
    .filter((item) => item.delta > 0)
    .sort((a, b) => b.delta - a.delta || (currentRanks[a.participant.id] || 999) - (currentRanks[b.participant.id] || 999));
  const showPointsBenefit = rankUps.length === 0;
  const target = featured[0];

  $("rankingView").innerHTML = `
    <div class="section-title"><h2>PARTIDOS ACTIVOS / SIGUIENTES</h2><span class="pill">${
      state.config.isLiveRanking ? "Ranking en vivo" : "Resultados confirmados"
    }</span></div>
    <div class="featured-matches">
      ${featured.map((match) => featuredMatchCard(match, list)).join("")}
    </div>
    <div class="section-title">
      <h2>CAMBIO EN EL RANKING</h2>
      <button class="ranking-filter-toggle" data-ranking-filter-toggle type="button">${rankingFilterLabel(state.rankingFilter)}</button>
    </div>
    <div class="ranking-card">
      ${displayParticipants
        .map((participant) => {
          const delta =
            (baseRanks[participant.id] || currentRanks[participant.id] || 1) -
            (currentRanks[participant.id] || 1);
          const moveClass = delta > 0 ? "up" : delta < 0 ? "down" : "same";
          const symbol = delta > 0 ? "&#9650;" : delta < 0 ? "&#9660;" : "&bull;";
          return `<div class="ranking-row ${participant.isUser ? "user" : ""}">
            <b>#${currentRanks[participant.id] || 1}</b>
            <div><b>${escapeHtml(participant.quinielaName)}</b><small>${escapeHtml(participant.ownerName)}${participant.isUser ? " - Tu" : ""}</small></div>
            <span class="ranking-predictions">${featured.map((match) => rankingPrediction(participant, match)).join("")}</span>
            <span class="move ${moveClass}">${symbol} ${Math.abs(delta)}</span>
            <b>${currentScores[participant.id] || 0}</b>
          </div>`;
        })
        .join("")}
    </div>
    <div class="impact-grid">
      ${impactCard(
        "BENEFICIADOS",
        showPointsBenefit
          ? movement.filter((item) => item.pointsDelta > 0).sort((a, b) => b.pointsDelta - a.pointsDelta)
          : rankUps,
        "good",
        showPointsBenefit,
      )}
      ${impactCard("PERJUDICADOS", movement.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta), "bad")}
    </div>
    ${
      target
        ? `<div class="section-title"><h2>ESCENARIOS RÁPIDOS &middot; <span class="flag-pair">${matchFlags(target)}</span></h2></div>
          <div class="scenario-strip">
            ${[[1, 0], [2, 1], [3, 1], [2, 0], [1, 1], [0, 1]]
              .map(([home, away]) => {
                const active = simulationScore(target)?.join("-") === `${home}-${away}`;
                return `<button class="scenario ${active ? "active" : ""}" data-match-id="${target.id}" data-home="${home}" data-away="${away}" type="button">${home}-${away}</button>`;
              })
              .join("")}
          </div>`
        : ""
    }`;
}

function calculateRankingScopeScores(list, featured, includeFeatured) {
  const lastMatch = featured.at(-1);
  if (!lastMatch) return Object.fromEntries(list.map((participant) => [participant.id, 0]));
  const featuredIds = new Set(featured.map((match) => match.id));
  const timelineMatches = activeMatches().filter(
    (match) =>
      match.date < lastMatch.date ||
      (match.date === lastMatch.date && match.time <= lastMatch.time),
  );

  const resolver = (match) => {
    if (featuredIds.has(match.id) && !includeFeatured) return null;
    return effectiveScore(match);
  };

  const scores = Object.fromEntries(list.map((participant) => [participant.id, 0]));
  list.forEach((participant) => {
    timelineMatches.forEach((match) => {
      scores[participant.id] += pointValue(participant.predictions[match.id], resolver(match));
    });
  });

  activeGroups().forEach((group) => {
    const groupMatches = MATCHES.filter((match) => match.group === group);
    if (!groupMatches.every((match) => resolver(match))) return;
    const winner = groupWinner(group, resolver);
    if (!winner) return;
    list.forEach((participant) => {
      if (participant.winners[group] === winner) scores[participant.id] += 2;
    });
  });

  if (activePhase() === "knockout") {
    Object.keys(KNOCKOUT_WINNER_POINTS).forEach((round) => {
      const winner = knockoutWinner(round, resolver);
      if (!winner) return;
      list.forEach((participant) => {
        if (participant.winners[round] === winner) {
          scores[participant.id] += knockoutWinnerPointValue(round);
        }
      });
    });
  }

  return scores;
}

function rankingDisplayParticipants(sorted) {
  const userIndex = sorted.findIndex((participant) => participant.isUser);
  if (state.rankingFilter === "GENERAL") return sorted;
  if (state.rankingFilter === "NEAR_ME") {
    if (userIndex === -1) return sorted.slice(0, 6);
    const count = 6;
    const start = Math.max(0, Math.min(userIndex - 3, sorted.length - count));
    return sorted.slice(start, start + count);
  }
  const top5 = sorted.slice(0, 5);
  return userIndex >= 5 ? [...top5, sorted[userIndex]] : top5;
}

function rankingFilterLabel(filter) {
  if (filter === "NEAR_ME") return "Cerca de mí";
  if (filter === "GENERAL") return "General";
  return "Top 5";
}

function cycleRankingFilter() {
  state.rankingFilter =
    state.rankingFilter === "TOP_5"
      ? "NEAR_ME"
      : state.rankingFilter === "NEAR_ME"
        ? "GENERAL"
        : "TOP_5";
}

function rankingPrediction(participant, match) {
  const prediction = participant.predictions[match.id];
  return `<i>${prediction ? `(${prediction[0]}-${prediction[1]})` : "(-)"}</i>`;
}

function featuredMatchDistribution(match, officialParticipants) {
  const stats = matchPointStats(match, officialParticipants);
  if (!stats) return "";
  return `<div class="featured-distribution">
    ${statLabel(2, stats[2])}
    ${statLabel(1, stats[1])}
    ${statLabel(0, stats[0])}
  </div>`;
}

function featuredMatchCard(match, officialParticipants = []) {
  const actual = effectiveScore(match);
  const confirmed = confirmedIds().has(match.id);
  const simulated = !confirmed && Boolean(simulationScore(match));
  const live = match.started && match.isActive && !simulated;
  const statusClass = simulated
    ? "simulated"
    : live
      ? "live"
      : confirmed
        ? "confirmed"
        : "upcoming";
  const label = simulated
    ? "RESULTADO SIMULADO"
    : confirmed
      ? "RESULTADO FINAL"
      : live
        ? "EN CURSO (VIVO)"
        : "PRÓXIMO PARTIDO";

  return `<article class="featured-match ${statusClass}">
    ${
      simulated
        ? `<button class="clear-featured-simulation" data-clear-match-id="${match.id}" type="button">
            ${match.started && match.isActive ? "VOLVER A EN VIVO" : "BORRAR SIMULACIÓN"}
          </button>`
        : ""
    }
    <button
      class="featured-match-main ${confirmed ? "" : "edit-score"}"
      ${confirmed ? "disabled" : `data-match-id="${match.id}"`}
      type="button"
      aria-label="${confirmed ? "Resultado final" : "Simular resultado"} de ${escapeHtml(match.homeTeam)} contra ${escapeHtml(match.awayTeam)}"
    >
      <span class="featured-match-status">${label}</span>
      <span class="featured-match-row">
        <span class="featured-team home">
          ${teamFlagMarkup(match.homeTeam, match.homeFlag, "featured-flag")}
          <b>${escapeHtml(match.homeTeam)}</b>
        </span>
        <strong>${scoreText(actual, "-")}</strong>
        <span class="featured-team away">
          <b>${escapeHtml(match.awayTeam)}</b>
          ${teamFlagMarkup(match.awayTeam, match.awayFlag, "featured-flag")}
        </span>
      </span>
      ${featuredMatchDistribution(match, officialParticipants)}
    </button>
  </article>`;
}

function featuredMatches() {
  const phaseMatches = activeMatches();
  const live = phaseMatches.filter((match) => match.started && match.isActive);
  if (live.length) return live;
  const simulated = phaseMatches.filter((match) => simulationScore(match));
  if (simulated.length) {
    const lastDate = simulated.map((match) => match.date).sort().at(-1);
    return simulated.filter((match) => match.date === lastDate);
  }
  const upcoming = phaseMatches.filter((match) => !match.finished).sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
  if (!upcoming.length) return phaseMatches.slice(-1);
  const first = upcoming[0];
  return upcoming.filter((match) => match.date === first.date && match.time === first.time);
}

function impactCard(title, entries, className, usePoints = false) {
  return `<article class="impact-card ${className}">
    <h3>${title}</h3>
    ${
      entries.length
        ? entries
            .slice(0, 5)
            .map(
              ({ participant, delta, pointsDelta }) =>
                `<div class="impact-item"><span>${escapeHtml(participant.quinielaName)}</span><b>${
                  usePoints ? `+${pointsDelta} pts` : `${delta > 0 ? "+" : ""}${delta}`
                }</b></div>`,
            )
            .join("")
        : '<div class="impact-item"><span>Sin cambios</span><b>0</b></div>'
    }
  </article>`;
}

function teamFlag(teamName) {
  const match = MATCHES.find(
    (item) => item.homeTeam === teamName || item.awayTeam === teamName,
  );
  if (!match) return "ðŸ³";
  const emoji = match.homeTeam === teamName ? match.homeFlag : match.awayFlag;
  return teamFlagMarkup(teamName, emoji, "inline-flag");
}

function matchFlags(match) {
  return `${teamFlagMarkup(match.homeTeam, match.homeFlag, "inline-flag")}${teamFlagMarkup(match.awayTeam, match.awayFlag, "inline-flag")}`;
}

function scoreText(score, fallback) {
  return score ? `${score[0]}-${score[1]}` : fallback;
}

function inlineScoreEditor(match, className = "") {
  const score = simulationScore(match) || officialScore(match) || ["", ""];
  return `<span class="inline-score ${className}" data-inline-match-id="${match.id}">
    <input value="${escapeHtml(String(score[0] ?? ""))}" inputmode="numeric" pattern="[0-9]*" maxlength="2" data-inline-score="home" aria-label="Marcador ${escapeHtml(match.homeTeam)}" />
    <span>-</span>
    <input value="${escapeHtml(String(score[1] ?? ""))}" inputmode="numeric" pattern="[0-9]*" maxlength="2" data-inline-score="away" aria-label="Marcador ${escapeHtml(match.awayTeam)}" />
  </span>`;
}

function openScoreDialog(matchId) {
  const match = MATCHES.find((item) => item.id === matchId);
  if (!match) return;
  if (confirmedIds().has(match.id)) {
    showToast("El resultado oficial ya está confirmado");
    return;
  }
  state.dialogMatchId = matchId;
  const score = simulationScore(match) || officialScore(match) || [0, 0];
  $("dialogMeta").textContent = `${match.group} · ${formatDate(match.date)} · ${match.time}`;
  $("dialogTitle").textContent = `${match.homeFlag} ${match.homeTeam} vs ${match.awayTeam} ${match.awayFlag}`;
  $("homeLabel").textContent = match.homeTeam;
  $("awayLabel").textContent = match.awayTeam;
  $("homeScore").value = score[0];
  $("awayScore").value = score[1];
  $("officialScoreNote").textContent = officialScore(match)
    ? `Resultado oficial disponible: ${scoreText(officialScore(match), "")}`
    : "Este resultado se guardará como simulación.";
  $("clearScoreBtn").hidden = !simulationScore(match);
  $("scoreDialog").showModal();
}

function applySimulation(matchId, home, away) {
  state.config.simulations[matchId] = { home: Number(home), away: Number(away) };
  saveConfig();
  render();
}

function clearSimulation(matchId) {
  delete state.config.simulations[matchId];
  saveConfig();
  render();
}

function sanitizeInlineScore(input) {
  input.value = input.value.replace(/\D/g, "").slice(0, 2);
}

function commitInlineSimulation(input) {
  const container = input.closest("[data-inline-match-id]");
  if (!container) return;
  const matchId = container.dataset.inlineMatchId;
  const match = MATCHES.find((item) => item.id === matchId);
  if (!match || match.started || confirmedIds().has(match.id)) return;
  const home = container.querySelector('[data-inline-score="home"]')?.value ?? "";
  const away = container.querySelector('[data-inline-score="away"]')?.value ?? "";
  if (home === "" && away === "") {
    if (simulationScore(match)) clearSimulation(matchId);
    return;
  }
  if (home === "" || away === "") return;
  applySimulation(matchId, home, away);
  showToast("Resultado simulado");
}

function openLoadDialog() {
  const pools = getPools();
  const phaseIsKnockout = activePhase() === "knockout";
  const officialPoolIds = new Set(
    pools
      .filter((pool) => pool.isSent && Boolean(pool.isKnockout) === phaseIsKnockout)
      .map((pool) => String(pool.id)),
  );
  const candidates = pools.filter(
    (pool) => Boolean(pool.isKnockout) === phaseIsKnockout && !officialPoolIds.has(String(pool.id)),
  );
  $("loadPoolList").innerHTML = candidates.length
    ? candidates
        .map((pool) => {
          const added = state.config.addedPoolIds.includes(String(pool.id));
          return `<button class="dialog-list-btn toggle-pool ${added ? "active" : ""}" data-pool-id="${pool.id}" type="button">
            ${added ? "✓" : "+"} ${escapeHtml(pool.quinielaName || "Sin nombre")} · ${escapeHtml(pool.propietarioName || "Anónimo")}
          </button>`;
        })
        .join("")
    : `<p class="dialog-note">No hay quinielas locales de ${activePhaseLabel().toLowerCase()} disponibles. Las enviadas ya aparecen como oficiales.</p>`;
  if (!$("loadDialog").open) $("loadDialog").showModal();
}

function openParticipantDialog(id) {
  const participant = participants().find((item) => item.id === id);
  if (!participant) return;
  state.participantDialogId = id;
  $("participantTitle").textContent = participant.quinielaName;
  $("compareBtn").textContent =
    state.config.comparisonParticipantId === id
      ? "Dejar de comparar"
      : "Comparar pronóstico";
  $("removeParticipantBtn").hidden = !participant.loaded;
  const currentCategory = state.config.pinnedParticipantCategories[id] || "";
  $("categorySelect").innerHTML = `<option value="">Sin categoría</option>${Object.entries(
    state.config.categoryNames,
  )
    .map(
      ([categoryId, name]) =>
        `<option value="${categoryId}" ${
          String(currentCategory) === String(categoryId) ? "selected" : ""
        }>${escapeHtml(name)}</option>`,
    )
    .join("")}`;
  $("participantDialog").showModal();
}

function openSettingsDialog() {
  renderSettingsDialog();
  $("settingsDialog").showModal();
}

function renderSettingsDialog() {
  const configs = getConfigs();
  $("configSelect").innerHTML = configs
    .map(
      (config) =>
        `<option value="${config.id}" ${config.id === state.config.id ? "selected" : ""}>${escapeHtml(config.configName)}</option>`,
    )
    .join("");
  $("deleteConfigBtn").disabled = state.config.id === "default";
}

function switchConfig(id) {
  const config = getConfigs().find((item) => item.id === id);
  if (!config) return;
  state.config = config;
  localStorage.setItem(ACTIVE_CONFIG_KEY, id);
  state.filter = "Todas";
  render();
  renderSettingsDialog();
}

function saveConfigCopy() {
  const name = $("newConfigName").value.trim();
  if (!name) return showToast("Escribe un nombre para la configuración");
  const copy = {
    ...structuredClone(state.config),
    id: crypto.randomUUID(),
    configName: name,
  };
  const configs = getConfigs();
  configs.push(copy);
  localStorage.setItem(CONFIGS_KEY, JSON.stringify(configs));
  state.config = copy;
  saveConfig();
  $("newConfigName").value = "";
  render();
  renderSettingsDialog();
  showToast("Configuración guardada");
}

function deleteCurrentConfig() {
  if (state.config.id === "default") return;
  const configs = getConfigs().filter((config) => config.id !== state.config.id);
  localStorage.setItem(CONFIGS_KEY, JSON.stringify(configs));
  state.config = configs[0] || defaultConfig();
  saveConfig();
  render();
  renderSettingsDialog();
  showToast("Configuración eliminada");
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

document.querySelectorAll(".view-tab").forEach((button) => {
  button.addEventListener("click", () => {
    state.view = button.dataset.view;
    render();
  });
});

$("liveToggle").addEventListener("change", (event) => {
  state.config.isLiveRanking = event.target.checked;
  saveConfig();
  render();
});

$("filterSelect").addEventListener("change", (event) => {
  state.filter = event.target.value;
  render();
});

$("searchToggle").addEventListener("click", () => {
  $("searchBar").hidden = false;
  $("searchInput").focus();
});

$("searchClose").addEventListener("click", () => {
  state.query = "";
  $("searchInput").value = "";
  $("searchBar").hidden = true;
  render();
});

$("searchInput").addEventListener("input", (event) => {
  state.query = event.target.value;
  render();
});

document.querySelector(".ranking-app").addEventListener("click", (event) => {
  if (event.target.closest("[data-ranking-filter-toggle]")) {
    cycleRankingFilter();
    return render();
  }
  const clearFeaturedButton = event.target.closest("[data-clear-match-id]");
  if (clearFeaturedButton) {
    clearSimulation(clearFeaturedButton.dataset.clearMatchId);
    return showToast("Simulación borrada");
  }
  const scoreButton = event.target.closest("[data-match-id].edit-score");
  if (scoreButton) return openScoreDialog(scoreButton.dataset.matchId);
  const participantButton = event.target.closest("[data-participant-id]");
  if (participantButton) return openParticipantDialog(participantButton.dataset.participantId);
  const dateButton = event.target.closest("[data-date]");
  if (dateButton) {
    state.selectedDate = dateButton.dataset.date;
    return render();
  }
  const scenario = event.target.closest(".scenario");
  if (scenario) {
    applySimulation(scenario.dataset.matchId, scenario.dataset.home, scenario.dataset.away);
    return showToast("Escenario aplicado");
  }
  if (event.target.closest(".open-load")) openLoadDialog();
});

document.querySelector(".ranking-app").addEventListener("input", (event) => {
  const input = event.target.closest("[data-inline-score]");
  if (input) sanitizeInlineScore(input);
});

document.querySelector(".ranking-app").addEventListener("change", (event) => {
  const input = event.target.closest("[data-inline-score]");
  if (input) commitInlineSimulation(input);
});

document.querySelector(".ranking-app").addEventListener("keydown", (event) => {
  const input = event.target.closest("[data-inline-score]");
  if (!input || event.key !== "Enter") return;
  event.preventDefault();
  input.blur();
  commitInlineSimulation(input);
});

$("scoreForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const match = MATCHES.find((item) => item.id === state.dialogMatchId);
  if (!match || confirmedIds().has(match.id)) {
    $("scoreDialog").close();
    return showToast("El resultado oficial ya está confirmado");
  }
  applySimulation(state.dialogMatchId, $("homeScore").value, $("awayScore").value);
  $("scoreDialog").close();
  showToast("Resultado simulado");
});
$("cancelScoreBtn").addEventListener("click", () => $("scoreDialog").close());
$("clearScoreBtn").addEventListener("click", () => {
  clearSimulation(state.dialogMatchId);
  $("scoreDialog").close();
  showToast("Simulación borrada");
});

$("closeLoadBtn").addEventListener("click", () => $("loadDialog").close());
$("loadPoolList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-pool-id]");
  if (!button) return;
  const id = String(button.dataset.poolId);
  if (state.config.addedPoolIds.includes(id)) {
    state.config.addedPoolIds = state.config.addedPoolIds.filter((poolId) => poolId !== id);
  } else {
    state.config.addedPoolIds.push(id);
  }
  saveConfig();
  render();
  openLoadDialog();
});

$("closeParticipantBtn").addEventListener("click", () => $("participantDialog").close());
$("compareBtn").addEventListener("click", () => {
  const id = state.participantDialogId;
  state.config.comparisonParticipantId =
    state.config.comparisonParticipantId === id ? null : id;
  saveConfig();
  $("participantDialog").close();
  render();
});
$("categorySelect").addEventListener("change", (event) => {
  const id = state.participantDialogId;
  const categoryId = event.target.value;
  if (!categoryId) {
    delete state.config.pinnedParticipantCategories[id];
    state.config.pinnedParticipantIds = state.config.pinnedParticipantIds.filter(
      (participantId) => participantId !== id,
    );
  } else {
    state.config.pinnedParticipantCategories[id] = Number(categoryId);
    if (!state.config.pinnedParticipantIds.includes(id)) {
      state.config.pinnedParticipantIds.push(id);
    }
  }
  saveConfig();
  $("participantDialog").close();
  render();
});
$("removeParticipantBtn").addEventListener("click", () => {
  const participant = participants().find((item) => item.id === state.participantDialogId);
  if (participant?.loaded) {
    state.config.addedPoolIds = state.config.addedPoolIds.filter(
      (poolId) => poolId !== participant.poolId,
    );
    delete state.config.pinnedParticipantCategories[participant.id];
    state.config.pinnedParticipantIds = state.config.pinnedParticipantIds.filter(
      (id) => id !== participant.id,
    );
    if (state.config.comparisonParticipantId === participant.id) {
      state.config.comparisonParticipantId = null;
    }
    saveConfig();
  }
  $("participantDialog").close();
  render();
});

$("settingsBtn").addEventListener("click", openSettingsDialog);
$("closeSettingsBtn").addEventListener("click", () => $("settingsDialog").close());
$("configSelect").addEventListener("change", (event) => switchConfig(event.target.value));
$("saveConfigBtn").addEventListener("click", saveConfigCopy);
$("deleteConfigBtn").addEventListener("click", deleteCurrentConfig);
$("clearResultsBtn").addEventListener("click", () => {
  state.config.simulations = {};
  saveConfig();
  render();
  showToast("Simulaciones borradas");
});
$("clearParticipantsBtn").addEventListener("click", () => {
  state.config.addedPoolIds = [];
  state.config.comparisonParticipantId = null;
  saveConfig();
  render();
  showToast("Quinielas añadidas eliminadas");
});
$("clearCategoriesBtn").addEventListener("click", () => {
  state.config.pinnedParticipantCategories = {};
  state.config.pinnedParticipantIds = [];
  saveConfig();
  state.filter = "Todas";
  render();
  showToast("Categorías limpiadas");
});
$("resetAllBtn").addEventListener("click", () => {
  const id = state.config.id;
  const name = state.config.configName;
  state.config = { ...defaultConfig(), id, configName: name };
  saveConfig();
  state.filter = "Todas";
  render();
  renderSettingsDialog();
  showToast("Configuración restablecida");
});

$("cardsView").addEventListener("click", (event) => {
  if (event.target.closest("#dayOnlyBtn")) {
    state.dayOnly = !state.dayOnly;
    render();
  }
});

window.addEventListener("storage", (event) => {
  if (!event.key || event.key === APP_CONFIG_CACHE_KEY) {
    state.appConfig = readCachedAppConfig();
  }
  loadActiveConfig();
  render();
});

loadActiveConfig();
render();
refreshAppConfig();

observeMatches(
  MATCHES,
  (updatedMatches) => {
    MATCHES.splice(0, MATCHES.length, ...updatedMatches);
    render();
  },
  () => showToast("Sin conexión en vivo. Mostrando resultados locales."),
);

refreshOfficialParticipants();
