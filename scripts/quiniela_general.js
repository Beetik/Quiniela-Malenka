import { MATCHES } from "./matches-data.js";
import {
  loadOfficialParticipants,
  observeMatches,
} from "./firebase-service.js";

const POOLS_KEY = "quinielaMalenka.saved";
const USER_KEY = "quinielaMalenka.user";
const CONFIGS_KEY = "quinielaMalenka.rankingConfigs";
const ACTIVE_CONFIG_KEY = "quinielaMalenka.activeRankingConfig";
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
const GROUPS = [...new Set(MATCHES.map((match) => match.group))];
const DATES = [...new Set(MATCHES.map((match) => match.date))].sort();

const state = {
  view: "table",
  filter: "Todas",
  query: "",
  selectedDate: nearestDate(),
  dayOnly: false,
  dialogMatchId: null,
  participantDialogId: null,
  config: null,
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
    predictions,
    winners: parseJson(pool.winnersJson, {}),
  };
}

function participants() {
  const pools = getPools();
  const official = cloudParticipantsLoaded
    ? cloudParticipants
    : pools.filter((pool) => pool.isSent).map((pool) => poolToParticipant(pool, false));
  const officialPoolIds = new Set(official.map((participant) => participant.poolId));
  const added = state.config.addedPoolIds
    .map((id) => pools.find((pool) => String(pool.id) === String(id)))
    .filter(Boolean)
    .filter((pool) => !officialPoolIds.has(String(pool.id)))
    .map((pool) => poolToParticipant(pool, true));
  return [...official, ...added];
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
    predictions,
    winners: item.groupWinners || {},
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

function calculateScores(list, resolver, includeLiveGroups, matchScope = MATCHES) {
  const scopeIds = new Set(matchScope.map((match) => match.id));
  return Object.fromEntries(
    list.map((participant) => {
      let points = 0;
      matchScope.forEach((match) => {
        points += pointValue(participant.predictions[match.id], resolver(match));
      });

      GROUPS.forEach((group) => {
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

function rankingData(list = participants(), matchScope = MATCHES) {
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
      const winner = groupWinner(match.group, effectiveScore);
      if (winner) {
        list.forEach((participant) => {
          if (participant.winners[match.group] === winner) {
            runningScores[participant.id] += 2;
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

function nearestDate() {
  const today = Date.now();
  return (
    DATES.map((date) => ({
      date,
      distance: Math.abs(new Date(`${date}T12:00:00-06:00`).getTime() - today),
    })).sort((a, b) => a.distance - b.distance)[0]?.date || DATES[0]
  );
}

function formatDate(date) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "short",
    timeZone: "America/Mexico_City",
  })
    .format(new Date(`${date}T12:00:00-06:00`))
    .replace(".", "");
}

function renderToolbar() {
  $("configName").textContent = state.config.configName;
  $("liveToggle").checked = state.config.isLiveRanking;
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
  renderToolbar();
  ["table", "cards", "ranking"].forEach((view) => {
    $(`${view}View`).hidden = state.view !== view;
  });
  renderTable();
  renderCards();
  renderGlobalRanking();
}

function renderEmpty(action = true) {
  return `<div class="empty-state"><div><p>No hay quinielas participantes.</p>${
    action ? '<button class="open-load" type="button">Añadir quinielas guardadas</button>' : ""
  }</div></div>`;
}

function renderTable() {
  const list = orderedParticipants();
  if (!list.length) {
    $("tableView").innerHTML = renderEmpty();
    return;
  }
  const tableMatches = [...MATCHES].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.time.localeCompare(b.time) ||
      a.id.localeCompare(b.id),
  );
  const matchHistoryRanks = historicalRanksByMatch(
    participants(),
    tableMatches,
  );
  const data = rankingData(participants());
  const winnerRows = GROUPS.map((group) => {
    const winner = groupWinner(group, effectiveScore);
    const groupFinished = MATCHES.filter((match) => match.group === group).every((match) =>
      effectiveScore(match),
    );
    return `<tr>
      <td><div class="match-label"><span>&#127942;</span><b>${group}</b><span>Ganador</span></div></td>
      ${list
        .map((participant) => {
          const team = participant.winners[group] || "-";
          const correct = groupFinished && winner && team === winner;
          return `<td>${team === "-" ? "-" : teamFlag(team)}${
            groupFinished ? pointTag(correct ? 2 : 0) : ""
          }</td>`;
        })
        .join("")}
    </tr>`;
  }).join("");

  $("tableView").innerHTML = `
    <div class="table-shell">
      <table class="ranking-matrix">
        <thead>
          <tr>
            <th>Partido / Resultado</th>
            ${list.map(participantHeader).join("")}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>Posición actual</b></td>
            ${list
              .map(
                (participant) =>
                  `<td>${rankBadge(data.currentRanks[participant.id] || 1, participant.loaded)}</td>`,
              )
              .join("")}
          </tr>
          <tr>
            <td><b>Puntos</b></td>
            ${list
              .map(
                (participant) =>
                  `<td><b>${data.currentScores[participant.id] || 0}</b></td>`,
              )
              .join("")}
          </tr>
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
                  <span>${match.homeFlag} ${match.awayFlag}</span>
                  <b class="${resultClass}">${scoreText(effectiveScore(match), "-")}</b>
                  ${
                    confirmed
                      ? ""
                      : `<button class="edit-score" data-match-id="${match.id}" type="button" aria-label="Editar resultado">&#9998;</button>`
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
  return `<span class="rank-badge ${cls}">${rank}°</span>`;
}

function renderCards() {
  const list = orderedParticipants();
  const dayMatches = MATCHES.filter((match) => match.date === state.selectedDate);
  const scope = state.dayOnly
    ? dayMatches
    : MATCHES.filter((match) => match.date <= state.selectedDate);
  const data = rankingData(participants(), scope);
  const simulatedDates = new Set(
    MATCHES.filter((match) => simulationScore(match)).map((match) => match.date),
  );

  $("cardsView").innerHTML = `
    <div class="cards-options">
      <div class="date-strip">
        ${DATES.map(
          (date) =>
            `<button class="date-chip ${date === state.selectedDate ? "active" : ""} ${
              simulatedDates.has(date) ? "simulated" : ""
            }" data-date="${date}" type="button">${formatDate(date)}</button>`,
        ).join("")}
      </div>
      <button id="dayOnlyBtn" class="day-toggle ${state.dayOnly ? "active" : ""}" type="button">
        ${state.dayOnly ? "Solo día" : "Acumulado"}
      </button>
    </div>
    <div class="match-strip">
      ${dayMatches.map(matchCard).join("")}
    </div>
    <div class="section-title">
      <h2>PARTICIPANTES Y PRONÓSTICOS</h2>
      <span class="pill">${state.dayOnly ? "Puntos del día" : `Acumulado al ${formatDate(state.selectedDate)}`}</span>
    </div>
    <div class="participant-strip">
      <button class="add-card open-load" type="button">＋<br />Añadir quiniela</button>
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
                  <div class="card-score">
                    <div><strong>#${data.currentRanks[participant.id] || 1}</strong><p>ranking</p></div>
                    <b>${data.currentScores[participant.id] || 0} pts</b>
                  </div>
                  <div class="prediction-list">
                    ${dayMatches
                      .map(
                        (match) =>
                          `<div class="prediction-row"><span>${match.homeFlag} vs ${match.awayFlag}</span><b>${
                            participant.predictions[match.id]?.join("-") || "-"
                          }</b></div>`,
                      )
                      .join("")}
                  </div>
                </article>`,
              )
              .join("")
          : ""
      }
    </div>`;
}

function matchCard(match) {
  const actual = effectiveScore(match);
  const confirmed = confirmedIds().has(match.id);
  const simulated = !confirmed && Boolean(simulationScore(match));
  const live = match.started && match.isActive && !simulated;
  const cls = simulated ? "simulated" : live ? "live" : confirmed ? "confirmed" : "";
  const status = simulated
    ? "Simulado"
    : live
      ? "En vivo"
      : confirmed
        ? "Confirmado"
        : "Programado";
  return `<article class="match-card ${cls}">
    <small>${match.group} · ${match.time}</small>
    <div class="flags">${match.homeFlag} VS ${match.awayFlag}</div>
    <span>${status}</span>
    <div class="score">${scoreText(actual, "-")}</div>
    ${
      confirmed
        ? ""
        : `<button class="small-btn edit-score" data-match-id="${match.id}" type="button">${simulated ? "Editar" : "Simular"}</button>`
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
  const currentData = rankingData(list);
  const baseScores = calculateScores(list, (match) => {
    if (featured.some((item) => item.id === match.id)) return baseScore(match);
    return effectiveScore(match);
  }, false);
  const baseRanks = denseRanks(list, baseScores, false);
  const sorted = [...list].sort(
    (a, b) =>
      (currentData.currentRanks[a.id] || 999) - (currentData.currentRanks[b.id] || 999),
  );
  const movement = sorted.map((participant) => ({
    participant,
    delta:
      (baseRanks[participant.id] || currentData.currentRanks[participant.id] || 1) -
      (currentData.currentRanks[participant.id] || 1),
  }));
  const target = featured[0];

  $("rankingView").innerHTML = `
    <div class="section-title"><h2>PARTIDOS ACTIVOS / SIGUIENTES</h2><span class="pill">${
      state.config.isLiveRanking ? "Ranking en vivo" : "Resultados confirmados"
    }</span></div>
    <div class="match-strip">${featured.map(matchCard).join("")}</div>
    <div class="section-title"><h2>CAMBIO EN EL RANKING</h2><span class="pill">Top 10</span></div>
    <div class="ranking-card">
      ${sorted
        .slice(0, 10)
        .map((participant) => {
          const delta =
            (baseRanks[participant.id] || currentData.currentRanks[participant.id] || 1) -
            (currentData.currentRanks[participant.id] || 1);
          const moveClass = delta > 0 ? "up" : delta < 0 ? "down" : "same";
          const symbol = delta > 0 ? "▲" : delta < 0 ? "▼" : "•";
          return `<div class="ranking-row ${participant.isUser ? "user" : ""}">
            <b>#${currentData.currentRanks[participant.id] || 1}</b>
            <div><b>${escapeHtml(participant.quinielaName)}</b><small>${escapeHtml(participant.ownerName)}</small></div>
            <span class="move ${moveClass}">${symbol} ${Math.abs(delta)}</span>
            <b>${currentData.currentScores[participant.id] || 0}</b>
          </div>`;
        })
        .join("")}
    </div>
    <div class="impact-grid">
      ${impactCard("BENEFICIADOS", movement.filter((item) => item.delta > 0).sort((a, b) => b.delta - a.delta), "good")}
      ${impactCard("PERJUDICADOS", movement.filter((item) => item.delta < 0).sort((a, b) => a.delta - b.delta), "bad")}
    </div>
    ${
      target
        ? `<div class="section-title"><h2>ESCENARIOS RÁPIDOS · ${target.homeFlag} ${target.awayFlag}</h2></div>
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

function featuredMatches() {
  const live = MATCHES.filter((match) => match.started && match.isActive);
  if (live.length) return live;
  const simulated = MATCHES.filter((match) => simulationScore(match));
  if (simulated.length) {
    const lastDate = simulated.map((match) => match.date).sort().at(-1);
    return simulated.filter((match) => match.date === lastDate);
  }
  const upcoming = MATCHES.filter((match) => !match.finished).sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
  );
  if (!upcoming.length) return MATCHES.slice(-1);
  const first = upcoming[0];
  return upcoming.filter((match) => match.date === first.date && match.time === first.time);
}

function impactCard(title, entries, className) {
  return `<article class="impact-card ${className}">
    <h3>${title}</h3>
    ${
      entries.length
        ? entries
            .slice(0, 5)
            .map(
              ({ participant, delta }) =>
                `<div class="impact-item"><span>${escapeHtml(participant.quinielaName)}</span><b>${
                  delta > 0 ? "+" : ""
                }${delta}</b></div>`,
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
  return match?.homeTeam === teamName ? match.homeFlag : match?.awayFlag || "🏳";
}

function scoreText(score, fallback) {
  return score ? `${score[0]}-${score[1]}` : fallback;
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

function openLoadDialog() {
  const pools = getPools();
  const officialPoolIds = new Set(
    pools.filter((pool) => pool.isSent).map((pool) => String(pool.id)),
  );
  const candidates = pools.filter((pool) => !officialPoolIds.has(String(pool.id)));
  $("loadPoolList").innerHTML = candidates.length
    ? candidates
        .map((pool) => {
          const added = state.config.addedPoolIds.includes(String(pool.id));
          return `<button class="dialog-list-btn toggle-pool ${added ? "active" : ""}" data-pool-id="${pool.id}" type="button">
            ${added ? "✓" : "＋"} ${escapeHtml(pool.quinielaName || "Sin nombre")} · ${escapeHtml(pool.propietarioName || "Anónimo")}
          </button>`;
        })
        .join("")
    : '<p class="dialog-note">No hay quinielas locales disponibles. Las enviadas ya aparecen como oficiales.</p>';
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

window.addEventListener("storage", () => {
  loadActiveConfig();
  render();
});

loadActiveConfig();
render();

observeMatches(
  MATCHES,
  (updatedMatches) => {
    MATCHES.splice(0, MATCHES.length, ...updatedMatches);
    render();
  },
  () => showToast("Sin conexión en vivo. Mostrando resultados locales."),
);

refreshOfficialParticipants();
