import { regularTimeScore } from "./match-score-utils.js";

const RARITY_ORDER = {
  comun: 1,
  raro: 2,
  epico: 3,
  legendario: 4,
  mitico: 5,
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function slugifyText(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function rarityWeight(rarity) {
  return RARITY_ORDER[normalizeText(rarity)] || 0;
}

function includesAny(haystack, terms) {
  return terms.some((term) => haystack.includes(normalizeText(term)));
}

function resultKind(home, away) {
  if (home > away) return 1;
  if (home < away) return 2;
  return 0;
}

function parseResultsMap(quiniela) {
  if (quiniela?.results && typeof quiniela.results === "object") return quiniela.results;
  try {
    return JSON.parse(quiniela?.resultsJson || "{}");
  } catch {
    return {};
  }
}

function parseWinnersMap(quiniela) {
  if (quiniela?.groupWinners && typeof quiniela.groupWinners === "object") return quiniela.groupWinners;
  if (quiniela?.winners && typeof quiniela.winners === "object") return quiniela.winners;
  try {
    return JSON.parse(quiniela?.winnersJson || "{}");
  } catch {
    return {};
  }
}

function getPredictionForMatch(results, match, index = 0) {
  if (!results || !match) return null;
  const keys = [
    match?.id,
    match?.firebaseDocId,
    match?.firebaseId,
    match?.cloudId,
    match?.cloudMapKey,
  ];

  const matchId = String(match?.id || "").trim();
  const firebaseId = String(match?.firebaseId || match?.firebaseDocId || "").trim();

  if (/^[AM]\d+$/i.test(matchId) && firebaseId) {
    keys.push(firebaseId);
  }

  if (/^A\d+$/i.test(matchId)) {
    const numeric = Number.parseInt(matchId.slice(1), 10);
    if (Number.isFinite(numeric)) {
      keys.push(`M${String(numeric).padStart(2, "0")}`);
    }
  }

  if (/^M\d+$/i.test(matchId)) {
    const numeric = Number.parseInt(matchId.slice(1), 10);
    if (Number.isFinite(numeric)) {
      keys.push(`A${numeric}`);
    }
  }

  if (Number.isFinite(index)) {
    keys.push(`M${String(index + 1).padStart(2, "0")}`);
    keys.push(`A${index + 1}`);
  }

  for (const key of keys) {
    const normalizedKey = String(key || "").trim();
    if (normalizedKey && results[normalizedKey] != null) {
      return results[normalizedKey];
    }
  }

  return null;
}

function readPredictionScores(prediction) {
  if (!prediction) return { home: null, away: null };
  if (Array.isArray(prediction)) {
    const home = Number.parseInt(prediction[0], 10);
    const away = Number.parseInt(prediction[1], 10);
    return {
      home: Number.isFinite(home) ? home : null,
      away: Number.isFinite(away) ? away : null,
    };
  }

  const homeValue =
    prediction.homeScore ??
    prediction.home ??
    prediction.scoreHome ??
    prediction.local ??
    prediction.localScore ??
    prediction.markHome ??
    prediction.goalsHome;
  const awayValue =
    prediction.awayScore ??
    prediction.away ??
    prediction.scoreAway ??
    prediction.visitor ??
    prediction.visitorScore ??
    prediction.markAway ??
    prediction.goalsAway;

  const home = Number.parseInt(homeValue, 10);
  const away = Number.parseInt(awayValue, 10);
  return {
    home: Number.isFinite(home) ? home : null,
    away: Number.isFinite(away) ? away : null,
  };
}

function getMatchKey(match) {
  return String(match?.firebaseDocId || match?.firebaseId || match?.id || "").trim();
}

function getJornadaKey(match) {
  return String(match?.date || match?.group || "jornada").trim();
}

function sortMatches(matches = []) {
  return [...matches].sort(
    (a, b) =>
      String(a?.date || "").localeCompare(String(b?.date || ""), "es") ||
      String(a?.time || "").localeCompare(String(b?.time || ""), "es") ||
      String(a?.firebaseDocId || a?.id || "").localeCompare(String(b?.firebaseDocId || b?.id || ""), "es"),
  );
}

function compareSummary(a, b) {
  return (
    (Number(b.totalPoints) || 0) - (Number(a.totalPoints) || 0) ||
    (Number(b.exacts) || 0) - (Number(a.exacts) || 0) ||
    (Number(b.invertedExacts) || 0) - (Number(a.invertedExacts) || 0) ||
    String(a.label || a.userEmail || a.id || "").localeCompare(String(b.label || b.userEmail || b.id || ""), "es")
  );
}

function calculateRealGroupWinners(matches = []) {
  const groups = [...new Set(matches.map((match) => match.group))];
  return Object.fromEntries(
    groups.map((group) => {
      const groupMatches = matches.filter((match) => match.group === group);
      if (!groupMatches.every((match) => match.finished)) return [group, null];

      const table = {};
      const goals = {};

      groupMatches.forEach((match) => {
        const score = regularTimeScore(match);
        if (!score) return;
        const [home, away] = score;
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
          (goals[b] || 0) - (goals[a] || 0) ||
          a.localeCompare(b, "es"),
      )[0];

      return [group, winner || null];
    }),
  );
}

function calculateQuinielaStats(quiniela, matches = []) {
  const results = parseResultsMap(quiniela);
  const winners = parseWinnersMap(quiniela);
  const realWinners = calculateRealGroupWinners(matches);
  const groupStats = new Map();
  const jornadaStats = new Map();
  const orderedMatches = sortMatches(matches);

  let totalPoints = 0;
  let hits = 0;
  let exacts = 0;
  let invertedExacts = 0;
  let drawExacts = 0;
  let bigMarginExacts = 0;
  let pointStreak = 0;
  let exactStreak = 0;
  let noPointStreak = 0;
  let bestPointStreak = 0;
  let bestExactStreak = 0;
  let bestNoPointStreak = 0;
  let partidosSinPuntosConsecutivos = 0;
  let partidosSinPuntosMaximos = 0;
  let lastFinishedMatchKey = null;

  orderedMatches.forEach((match, index) => {
    const matchKey = getMatchKey(match);
    const jornadaKey = getJornadaKey(match);

    if (!jornadaStats.has(jornadaKey)) {
      jornadaStats.set(jornadaKey, {
        totalMatches: 0,
        finishedMatches: 0,
        points: 0,
        exacts: 0,
        hits: 0,
        lastMatchPoints: 0,
        lastMatchExact: false,
        lastMatchKey: null,
      });
    }

    const jornada = jornadaStats.get(jornadaKey);
    jornada.lastMatchKey = matchKey || jornada.lastMatchKey;
    jornada.totalMatches += 1;

    if (!groupStats.has(match.group)) {
      groupStats.set(match.group, {
        points: 0,
        exacts: 0,
        hits: 0,
        finishedMatches: 0,
      });
    }

    const group = groupStats.get(match.group);

    const real = match.finished ? regularTimeScore(match) : null;
    if (!real) {
      return;
    }

    const prediction = getPredictionForMatch(results, match, index);
    const { home, away } = readPredictionScores(prediction);
    const [realHome, realAway] = real;
    const exact = home != null && away != null && home === realHome && away === realAway;
    const invertedExact =
      home != null &&
      away != null &&
      home === realAway &&
      away === realHome &&
      !exact;
    const sameOutcome = home != null && away != null && resultKind(home, away) === resultKind(realHome, realAway);
    const points = exact ? 2 : sameOutcome ? 1 : 0;

    totalPoints += points;
    group.points += points;
    jornada.points += points;

    if (points > 0) {
      hits += 1;
      group.hits += 1;
      jornada.hits += 1;
      pointStreak += 1;
      noPointStreak = 0;
      partidosSinPuntosConsecutivos = 0;
    } else {
      pointStreak = 0;
      noPointStreak += 1;
      partidosSinPuntosConsecutivos += 1;
      partidosSinPuntosMaximos = Math.max(partidosSinPuntosMaximos, partidosSinPuntosConsecutivos);
    }

    if (exact) {
      exacts += 1;
      group.exacts += 1;
      jornada.exacts += 1;
      exactStreak += 1;
      drawExacts += realHome === realAway ? 1 : 0;
      bigMarginExacts += Math.abs(realHome - realAway) >= 4 ? 1 : 0;
    } else {
      exactStreak = 0;
    }

    if (invertedExact) invertedExacts += 1;

    bestPointStreak = Math.max(bestPointStreak, pointStreak);
    bestExactStreak = Math.max(bestExactStreak, exactStreak);
    bestNoPointStreak = Math.max(bestNoPointStreak, noPointStreak);
    jornada.finishedMatches += 1;
    jornada.lastMatchPoints = points;
    jornada.lastMatchExact = exact;
    lastFinishedMatchKey = matchKey || lastFinishedMatchKey;
  });

  const correctGroupWinners = Object.entries(realWinners).reduce((count, [group, winner]) => {
    if (winner && winners[group] === winner) return count + 1;
    return count;
  }, 0);

  let bestGroupPoints = 0;
  let bestGroupExacts = 0;
  let bestGroupCleanPoints = 0;
  let bestPerfectGroups = 0;
  let bestZeroPointGroups = 0;
  let bestJornadaPoints = 0;
  let bestJornadaExacts = 0;
  let jornadasConCeroPuntos = 0;
  let jornadasSinPuntosConsecutivas = 0;
  let bestJornadasSinPuntosConsecutivas = 0;
  let jornadasUltimoLugarConsecutivas = 0;
  let jornadaLastMatchPointsCount = 0;
  let lastCompletedJornadaKey = null;

  groupStats.forEach((stats) => {
    bestGroupPoints = Math.max(bestGroupPoints, stats.points);
    bestGroupExacts = Math.max(bestGroupExacts, stats.exacts);
    if (stats.exacts === 0) bestGroupCleanPoints = Math.max(bestGroupCleanPoints, stats.points);
    if (stats.finishedMatches > 0 && stats.exacts === stats.finishedMatches) bestPerfectGroups += 1;
    if (stats.points === 0 && stats.finishedMatches > 0) bestZeroPointGroups += 1;
  });

  [...jornadaStats.entries()].forEach(([jornadaKey, stats]) => {
    if (stats.finishedMatches > 0 && stats.lastMatchPoints > 0) jornadaLastMatchPointsCount += 1;
    if (stats.points > 0) {
      jornadasSinPuntosConsecutivas = 0;
    } else if (stats.finishedMatches > 0) {
      jornadasConCeroPuntos += 1;
      jornadasSinPuntosConsecutivas += 1;
      bestJornadasSinPuntosConsecutivas = Math.max(bestJornadasSinPuntosConsecutivas, jornadasSinPuntosConsecutivas);
    }
    if (stats.finishedMatches > 0 && stats.points === 0) {
      jornadasUltimoLugarConsecutivas += 1;
    } else {
      jornadasUltimoLugarConsecutivas = 0;
    }
    bestJornadaPoints = Math.max(bestJornadaPoints, stats.points);
    bestJornadaExacts = Math.max(bestJornadaExacts, stats.exacts);
    if (stats.totalMatches > 0 && stats.finishedMatches === stats.totalMatches) lastCompletedJornadaKey = jornadaKey;
  });

  const jornadaKeysInOrder = [...jornadaStats.keys()];
  const jornadasWithActivity = jornadaKeysInOrder.filter((jornadaKey) => (jornadaStats.get(jornadaKey)?.finishedMatches || 0) > 0);

  return {
    totalPoints,
    hits,
    exacts,
    invertedExacts,
    drawExacts,
    bigMarginExacts,
    groupWinnerHits: correctGroupWinners,
    bestPointStreak,
    bestExactStreak,
    bestNoPointStreak: Math.max(bestNoPointStreak, bestJornadasSinPuntosConsecutivas),
    partidosSinPuntosConsecutivos,
    partidosSinPuntosMaximos: Math.max(partidosSinPuntosMaximos, bestNoPointStreak),
    bestGroupPoints,
    bestGroupExacts,
    bestGroupCleanPoints,
    perfectGroups: bestPerfectGroups,
    zeroPointGroups: bestZeroPointGroups,
    bestJornadaPoints,
    bestJornadaExacts,
    jornadasConCeroPuntos,
    jornadasSinPuntosConsecutivas: Math.max(jornadasSinPuntosConsecutivas, 0),
    jornadasSinPuntosMaximas: bestJornadasSinPuntosConsecutivas,
    jornadasUltimoLugarConsecutivas,
    jornadasUltimoLugarMaximas: jornadasUltimoLugarConsecutivas,
    puntosUltimoPartidoJornada: jornadaLastMatchPointsCount > 0,
    puntosUltimoPartidoJornadaCount: jornadaLastMatchPointsCount,
    ultimoPartidoEvaluado: lastFinishedMatchKey,
    ultimaJornadaEvaluada: lastCompletedJornadaKey,
    jornadaKeys: jornadaKeysInOrder,
    jornadasConActividad: jornadasWithActivity.length,
    jornadaStats,
  };
}

function calculateTournamentPositions(summaries = []) {
  const ordered = [...summaries].sort(compareSummary);
  return ordered.map((summary, index) => ({
    ...summary,
    posicion: index + 1,
  }));
}

function isParticipatingQuiniela(item = {}) {
  return Boolean(item?.isSent) && Boolean(item?.paymentReceived);
}

function buildAchievementStats({
  quinielas = [],
  matches = [],
  userEmail = "",
  rankingPosition = null,
  officialCount = 0,
} = {}) {
  const email = normalizeEmail(userEmail);
  const userQuinielas = email
    ? quinielas.filter((item) => normalizeEmail(item?.userEmail || item?.email) === email)
    : [...quinielas];
  const ownQuinielas = userQuinielas.filter(isParticipatingQuiniela);

  const finishedMatches = matches.filter((match) => match.finished).length;
  const groups = [...new Set(matches.map((match) => match.group))];
  const finishedGroups = groups.filter((group) =>
    matches.filter((match) => match.group === group).every((match) => match.finished),
  ).length;

  const perQuiniela = ownQuinielas.map((quiniela, index) => ({
    id: quiniela?.cloudId || quiniela?.cloudMapKey || quiniela?.id || `quiniela-${index}`,
    label: quiniela?.quinielaName || quiniela?.name || `Quiniela ${index + 1}`,
    userEmail: quiniela?.userEmail || quiniela?.email || email,
    ...calculateQuinielaStats(quiniela, matches),
  }));

  const bestSummary = perQuiniela.length
    ? [...perQuiniela].sort(compareSummary)[0]
    : {
        totalPoints: 0,
        hits: 0,
        exacts: 0,
        invertedExacts: 0,
        drawExacts: 0,
        bigMarginExacts: 0,
        groupWinnerHits: 0,
        bestPointStreak: 0,
        bestExactStreak: 0,
        bestNoPointStreak: 0,
        bestGroupPoints: 0,
        bestGroupExacts: 0,
        bestGroupCleanPoints: 0,
        perfectGroups: 0,
        zeroPointGroups: 0,
        bestJornadaPoints: 0,
        bestJornadaExacts: 0,
        jornadasConCeroPuntos: 0,
        jornadasSinPuntosConsecutivas: 0,
        jornadasSinPuntosMaximas: 0,
        puntosUltimoPartidoJornada: false,
        puntosUltimoPartidoJornadaCount: 0,
        ultimoPartidoEvaluado: null,
        ultimaJornadaEvaluada: null,
        jornadaStats: new Map(),
      };

  const participantSummaries = quinielas
    .map((quiniela, index) => ({
      id: quiniela?.cloudId || quiniela?.cloudMapKey || quiniela?.id || `participant-${index}`,
      label: quiniela?.quinielaName || quiniela?.name || `Participante ${index + 1}`,
      userEmail: quiniela?.userEmail || quiniela?.email || "",
      ...calculateQuinielaStats(quiniela, matches),
    }))
    .sort(compareSummary);

  const leaderboard = calculateTournamentPositions(participantSummaries);
  const bestOfficial = leaderboard[0] || null;
  const maxExactosTotales = leaderboard.reduce((max, item) => Math.max(max, Number(item.exacts) || 0), 0);
  const maxPuntosTotales = leaderboard.reduce((max, item) => Math.max(max, Number(item.totalPoints) || 0), 0);
  const maxPointsTotales = leaderboard.reduce((max, item) => Math.max(max, Number(item.totalPoints) || 0), 0);

  const rankingPositionValue = Number.isFinite(Number(rankingPosition)) ? Number(rankingPosition) : null;
  const userPosition =
    bestSummary && participantSummaries.length
      ? participantSummaries.filter((item) => compareSummary(item, bestSummary) < 0).length + 1
      : rankingPositionValue;

  const jornadaKeys = [...(bestSummary.jornadaKeys || [])];
  const jornadasRanking = jornadaKeys.map((jornadaKey) => {
    const currentUserPoints = Number(bestSummary.jornadaStats?.get(jornadaKey)?.points) || 0;
    const currentUserExacts = Number(bestSummary.jornadaStats?.get(jornadaKey)?.exacts) || 0;
    const currentUserLastMatchPoints = Number(bestSummary.jornadaStats?.get(jornadaKey)?.lastMatchPoints) || 0;
    const positions = participantSummaries
      .map((summary) => ({
        points: Number(summary.jornadaStats?.get(jornadaKey)?.points) || 0,
        exacts: Number(summary.jornadaStats?.get(jornadaKey)?.exacts) || 0,
        lastMatchPoints: Number(summary.jornadaStats?.get(jornadaKey)?.lastMatchPoints) || 0,
      }))
      .sort(
        (a, b) =>
          b.points - a.points ||
          b.exacts - a.exacts ||
          b.lastMatchPoints - a.lastMatchPoints,
      );
    const rank =
      positions.findIndex(
        (item) =>
          item.points === currentUserPoints &&
          item.exacts === currentUserExacts &&
          item.lastMatchPoints === currentUserLastMatchPoints,
      ) + 1;
    return {
      jornadaKey,
      rank: rank > 0 ? rank : positions.length,
      total: positions.length,
      isLast: positions.length > 0 && rank === positions.length,
    };
  });

  let jornadasUltimoLugarConsecutivas = 0;
  let jornadasUltimoLugarMaximas = 0;
  jornadasRanking.forEach((item) => {
    if (item.isLast) {
      jornadasUltimoLugarConsecutivas += 1;
      jornadasUltimoLugarMaximas = Math.max(jornadasUltimoLugarMaximas, jornadasUltimoLugarConsecutivas);
    } else {
      jornadasUltimoLugarConsecutivas = 0;
    }
  });
  const jornadasUltimoLugarActual = jornadasUltimoLugarConsecutivas;

  const noPointStreaks = bestSummary.jornadasSinPuntosMaximas || bestSummary.bestNoPointStreak || 0;
  const hasLeaderBeforeFinal = (() => {
    if (!bestOfficial || !matches.some((match) => match.finished)) return false;

    const orderedFinishedMatches = sortMatches(matches).filter((match) => match.finished);
    if (orderedFinishedMatches.length <= 1) return false;

    const lastFinishedKey = getMatchKey(orderedFinishedMatches[orderedFinishedMatches.length - 1]);
    const reducedMatches = matches.filter((match) => getMatchKey(match) !== lastFinishedKey);
    const reducedUserSummaries = ownQuinielas.map((quiniela, index) => ({
      id: quiniela?.cloudId || quiniela?.cloudMapKey || quiniela?.id || `user-${index}`,
      label: quiniela?.quinielaName || quiniela?.name || `Quiniela ${index + 1}`,
      ...calculateQuinielaStats(quiniela, reducedMatches),
    }));
    const reducedOfficialSummaries = quinielas.map((quiniela, index) => ({
      id: quiniela?.cloudId || quiniela?.cloudMapKey || quiniela?.id || `participant-${index}`,
      label: quiniela?.quinielaName || quiniela?.name || `Participante ${index + 1}`,
      ...calculateQuinielaStats(quiniela, reducedMatches),
    }));
    const reducedUser = [...reducedUserSummaries].sort(compareSummary)[0];
    const reducedLeaderboard = [...reducedOfficialSummaries].sort(compareSummary);
    const reducedPosition = reducedLeaderboard.filter((item) => compareSummary(item, reducedUser) < 0).length + 1;
    return reducedPosition === 1 && userPosition !== 1;
  })();

  return {
    totalQuinielas: ownQuinielas.length,
    savedQuinielas: ownQuinielas.filter((item) => !item.isSent).length,
    sentQuinielas: ownQuinielas.filter((item) => item.isSent).length,
    completedQuinielas: ownQuinielas.filter((item) => {
      const results = parseResultsMap(item);
      const winners = parseWinnersMap(item);
      const matchesComplete = matches.every((match) => {
        const prediction = getPredictionForMatch(results, match);
        const { home, away } = readPredictionScores(prediction);
        return home != null && away != null;
      });
      const winnersComplete = groups.every((group) => winners[group]);
      return matchesComplete && winnersComplete;
    }).length,
    finishedMatches,
    finishedGroups,
    totalItems: finishedMatches + finishedGroups,
    bestScore: bestSummary.totalPoints || 0,
    totalScore: perQuiniela.reduce((sum, item) => sum + (Number(item.totalPoints) || 0), 0),
    bestHits: bestSummary.hits || 0,
    totalHits: perQuiniela.reduce((sum, item) => sum + (Number(item.hits) || 0), 0),
    bestExacts: bestSummary.exacts || 0,
    totalExacts: perQuiniela.reduce((sum, item) => sum + (Number(item.exacts) || 0), 0),
    bestDrawExacts: bestSummary.drawExacts || 0,
    totalDrawExacts: perQuiniela.reduce((sum, item) => sum + (Number(item.drawExacts) || 0), 0),
    bestBigMarginExacts: bestSummary.bigMarginExacts || 0,
    totalBigMarginExacts: perQuiniela.reduce((sum, item) => sum + (Number(item.bigMarginExacts) || 0), 0),
    groupWinnerHits: bestSummary.groupWinnerHits || 0,
    totalGroupWinnerHits: perQuiniela.reduce((sum, item) => sum + (Number(item.groupWinnerHits) || 0), 0),
    bestPointStreak: bestSummary.bestPointStreak || 0,
    bestExactStreak: bestSummary.bestExactStreak || 0,
    bestNoPointStreak: bestSummary.bestNoPointStreak || 0,
    partidosSinPuntosConsecutivos: bestSummary.partidosSinPuntosConsecutivos || 0,
    partidosSinPuntosMaximos: bestSummary.partidosSinPuntosMaximos || 0,
    bestGroupPoints: bestSummary.bestGroupPoints || 0,
    bestGroupExacts: bestSummary.bestGroupExacts || 0,
    bestGroupCleanPoints: bestSummary.bestGroupCleanPoints || 0,
    bestPerfectGroups: bestSummary.perfectGroups || 0,
    bestZeroPointGroups: bestSummary.zeroPointGroups || 0,
    exactosTotales: perQuiniela.reduce((sum, item) => sum + (Number(item.exacts) || 0), 0),
    contrariosExactos: bestSummary.invertedExacts || 0,
    jornadasSinPuntosConsecutivas: bestSummary.jornadasSinPuntosMaximas || 0,
    jornadasSinPuntosMaximas: bestSummary.jornadasSinPuntosMaximas || noPointStreaks,
    jornadasUltimoLugarConsecutivas: jornadasUltimoLugarActual,
    jornadasUltimoLugarMaximas,
    jornadasConCeroPuntos: bestSummary.jornadasConCeroPuntos || 0,
    mejorJornadaExactos: bestSummary.bestJornadaExacts || 0,
    mejorJornadaPuntos: bestSummary.bestJornadaPoints || 0,
    puntosUltimoPartidoJornada: Boolean(bestSummary.puntosUltimoPartidoJornada),
    puntosUltimoPartidoJornadaCount: bestSummary.puntosUltimoPartidoJornadaCount || 0,
    liderAntesDelFinal: hasLeaderBeforeFinal,
    posicionUsuario: userPosition,
    totalUsuarios: participantSummaries.length || Number(officialCount) || 0,
    posicionFinal: bestOfficial?.posicion || null,
    maxExactosTotales,
    maxPuntosTotales,
    rankingPosition: rankingPositionValue,
    officialCount: Number(officialCount) || participantSummaries.length || 0,
    ultimoPartidoEvaluado: bestSummary.ultimoPartidoEvaluado || null,
    ultimaJornadaEvaluada: bestSummary.ultimaJornadaEvaluada || null,
    bestSummary,
    leaderboard,
    quinielaSummaries: perQuiniela,
  };
}

function calculateRankingProgress(stats, achievementText) {
  const haystack = normalizeText(achievementText);
  const rank = stats.rankingPosition;
  if (!Number.isFinite(rank) || rank <= 0) return 0;

  if (haystack.includes("top 5")) return rank <= 5 ? 1 : 0;
  if (haystack.includes("top 10")) return rank <= 10 ? 1 : 0;
  if (includesAny(haystack, ["rey de la quiniela", "lider solitario", "primer lugar", "primero"])) {
    return rank === 1 ? 1 : 0;
  }
  if (includesAny(haystack, ["ultimo", "naufrago", "imposible"])) {
    return stats.officialCount && rank === stats.officialCount ? 1 : 0;
  }
  return rank === 1 ? 1 : 0;
}

function isDocumentAchievement(achievement) {
  const haystack = normalizeText(
    [achievement?.id, achievement?.title, achievement?.description]
      .filter(Boolean)
      .join(" "),
  );
  return [
    "pichichi",
    "hat trick",
    "hattrick",
    "autogol",
    "manitas",
    "francotirador",
    "anti oraculo",
    "naufrago",
    "no era penal",
    "gol al 90",
    "bota de oro",
    "seleccion mexicana en penales",
  ].some((term) => haystack.includes(term));
}

function achievementRuleProgress(achievement, stats = {}) {
  if (!isDocumentAchievement(achievement)) return null;

  const title = normalizeText(achievement?.title || achievement?.id);
  const description = normalizeText(achievement?.description);
  const haystack = `${title} ${description}`;

  if (includesAny(haystack, ["pichichi"])) return stats.bestBigMarginExacts || stats.bigMarginExacts || 0;
  if (includesAny(haystack, ["hat trick", "hat-trick", "hattrick"])) return stats.mejorJornadaExactos || stats.bestJornadaExacts || 0;
  if (includesAny(haystack, ["autogol"])) return stats.partidosSinPuntosMaximos || 0;
  if (includesAny(haystack, ["manitas"])) return stats.partidosSinPuntosMaximos || 0;
  if (includesAny(haystack, ["francotirador"])) {
    return Math.max(
      Number(stats.exactosTotales) || 0,
      Number(stats.totalExacts) || 0,
      Number(stats.bestExacts) || 0,
      Number(stats.bestSummary?.exacts) || 0,
    );
  }
  if (includesAny(haystack, ["anti oraculo", "anti-oraculo", "anti-oráculo"])) return stats.contrariosExactos || 0;
  if (includesAny(haystack, ["naufrago", "náufrago"])) return stats.jornadasUltimoLugarConsecutivas || 0;
  if (includesAny(haystack, ["no era penal"])) return stats.jornadasConCeroPuntos || 0;
  if (includesAny(haystack, ["gol al 90", "gol al 90'"])) return stats.puntosUltimoPartidoJornadaCount || 0;
  if (includesAny(haystack, ["bota de oro"])) {
    return stats.exactosTotales >= (stats.maxExactosTotales || 0) && (stats.maxExactosTotales || 0) > 0 ? 1 : 0;
  }
  if (includesAny(haystack, ["seleccion mexicana en penales", "seleccion mexicana"])) {
    return stats.liderAntesDelFinal && stats.posicionFinal && stats.posicionFinal !== 1 ? 1 : 0;
  }

  return null;
}

function calculateAchievementProgress(achievement, stats = {}) {
  const target = Math.max(0, Number(achievement?.target) || 0);
  if (!isDocumentAchievement(achievement)) return 0;
  const specificProgress = achievementRuleProgress(achievement, stats);
  if (specificProgress != null) {
    return target > 1 ? Math.min(target, specificProgress) : Math.min(1, specificProgress);
  }

  const haystack = normalizeText(
    [achievement?.id, achievement?.title, achievement?.description, achievement?.category]
      .filter(Boolean)
      .join(" "),
  );

  let progress = 0;

  if (includesAny(haystack, ["ranking", "posicion", "lider", "rey", "top", "puesto", "remont", "ultimo"])) {
    progress = calculateRankingProgress(stats, haystack);
  } else if (includesAny(haystack, ["grupo", "ganador", "primer lugar", "profeta", "oraculo", "apuesta maestra"])) {
    progress = Math.max(stats.groupWinnerHits || 0, stats.bestGroupExacts || 0, stats.bestPerfectGroups || 0);
  } else if (includesAny(haystack, ["exact", "marcador", "pichichi", "francotirador", "goat", "pele", "cr7", "r9", "zidane", "hat-trick"])) {
    if (includesAny(haystack, ["consecut", "racha", "seguido"])) {
      progress = Math.max(stats.bestExactStreak || 0, stats.bestPointStreak || 0);
    } else if (includesAny(haystack, ["total", "durante el torneo"])) {
      progress = Math.max(stats.totalExacts || 0, stats.bestExacts || 0);
    } else {
      progress = Math.max(stats.bestExacts || 0, stats.totalExacts || 0);
    }
  } else if (includesAny(haystack, ["punto", "puntos", "puntaje", "score"])) {
    if (includesAny(haystack, ["consecut", "racha", "seguido"])) {
      progress = stats.bestPointStreak || 0;
    } else if (includesAny(haystack, ["jornada", "grupo"])) {
      progress = Math.max(stats.bestGroupPoints || 0, stats.bestGroupCleanPoints || 0);
    } else {
      progress = Math.max(stats.bestScore || 0, stats.totalScore || 0);
    }
  } else if (includesAny(haystack, ["sin puntos", "no hagas puntos", "autogol", "naufrago", "no era penal"])) {
    progress = Math.max(stats.bestNoPointStreak || 0, stats.bestZeroPointGroups || 0);
  } else if (includesAny(haystack, ["empate", "catenaccio"])) {
    progress = stats.totalDrawExacts || 0;
  } else if (includesAny(haystack, ["mexico", "concacaf"])) {
    progress = Math.max(stats.bestGroupPoints || 0, stats.bestGroupExacts || 0);
  }

  if (!progress) {
    if (target <= 1) {
      progress = Math.max(
        stats.savedQuinielas > 0 ? 1 : 0,
        stats.sentQuinielas > 0 ? 1 : 0,
        stats.bestScore > 0 ? 1 : 0,
        stats.groupWinnerHits > 0 ? 1 : 0,
      );
    } else if (target <= 3) {
      progress = Math.max(
        stats.bestExacts || 0,
        stats.bestGroupExacts || 0,
        stats.bestGroupPoints || 0,
        stats.bestPointStreak || 0,
      );
    } else if (target <= 10) {
      progress = Math.max(
        stats.totalExacts || 0,
        stats.bestExacts || 0,
        stats.bestScore || 0,
        stats.totalHits || 0,
        stats.bestPointStreak || 0,
      );
    } else {
      progress = Math.max(
        stats.totalExacts || 0,
        stats.totalHits || 0,
        stats.totalScore || 0,
        stats.totalQuinielas || 0,
        stats.sentQuinielas || 0,
      );
    }
  }

  if (!Number.isFinite(progress) || progress < 0) progress = 0;
  if (target > 0) progress = Math.min(progress, target);
  return Math.trunc(progress);
}

function buildAchievementProgressMap(catalog, stats = {}, existingProgress = {}) {
  const entries = Array.isArray(catalog)
    ? catalog.map((item, index) => [String(item?.id || index), item])
    : Object.entries(catalog || {});

  return Object.fromEntries(
    entries.map(([id, achievement]) => {
      const progress = calculateAchievementProgress({ ...achievement, id }, stats);
      return [
        id,
        {
          progress,
          unlocked: progress >= (Number(achievement?.target) || 0),
          unlockedAt: existingProgress?.[id]?.unlockedAt || null,
          target: Math.max(0, Number(achievement?.target) || 0),
        },
      ];
    }),
  );
}

function mergeAchievementProgress(existingProgress = {}, computedProgress = {}) {
  const merged = { ...existingProgress };
  Object.entries(computedProgress).forEach(([id, nextEntry]) => {
    const current = merged[id];
    const currentProgress = typeof current === "number" ? current : Number(current?.progress) || 0;
    const nextProgress = Number(nextEntry?.progress) || 0;
    const target = Math.max(0, Number(nextEntry?.target) || Number(current?.target) || 0);
    const unlocked = Boolean(target > 0 && nextProgress >= target);
    const unlockedAt = unlocked ? current?.unlockedAt || nextEntry?.unlockedAt || null : null;

    merged[id] = {
      ...(current && typeof current === "object" ? current : {}),
      ...(nextEntry && typeof nextEntry === "object" ? nextEntry : {}),
      progress: Math.max(currentProgress, nextProgress),
      unlocked,
      unlockedAt,
      target,
    };
  });
  return merged;
}

function groupAchievementsByCategory(achievements) {
  return achievements.reduce((groups, achievement) => {
    (groups[achievement.category] ||= []).push(achievement);
    return groups;
  }, {});
}

function compareUnlockedAchievements(a, b) {
  return (
    rarityWeight(b.rarity) - rarityWeight(a.rarity) ||
    (Number(b.target) || 0) - (Number(a.target) || 0) ||
    (Number(b.progress) || 0) - (Number(a.progress) || 0) ||
    String(a.title).localeCompare(String(b.title), "es")
  );
}

function compareLockedAchievements(a, b) {
  const targetA = Math.max(1, Number(a.target) || 0);
  const targetB = Math.max(1, Number(b.target) || 0);
  const progressA = Number(a.progress) || 0;
  const progressB = Number(b.progress) || 0;
  const difficultyA = targetA * Math.max(1, rarityWeight(a.rarity) || 1);
  const difficultyB = targetB * Math.max(1, rarityWeight(b.rarity) || 1);
  const ratioA = progressA / targetA;
  const ratioB = progressB / targetB;

  return (
    ratioB - ratioA ||
    difficultyA - difficultyB ||
    progressB - progressA ||
    String(a.title).localeCompare(String(b.title), "es")
  );
}

function pickShowcaseAchievements(achievements, limit = 6) {
  const unlocked = achievements.filter((achievement) => achievement.unlocked).sort(compareUnlockedAchievements);
  const locked = achievements.filter((achievement) => !achievement.unlocked).sort(compareLockedAchievements);
  return unlocked.length >= limit
    ? unlocked.slice(0, limit)
    : [...unlocked, ...locked].slice(0, limit);
}

function badgeSlugForAchievement(achievement) {
  return slugifyText(achievement?.title || achievement?.icon || achievement?.id || "badge") || "badge";
}

function badgeUrlForAchievement(achievement) {
  return `./images/logros/${badgeSlugForAchievement(achievement)}.svg`;
}

export {
  badgeSlugForAchievement,
  badgeUrlForAchievement,
  buildAchievementProgressMap,
  buildAchievementStats,
  calculateQuinielaStats,
  compareLockedAchievements,
  compareUnlockedAchievements,
  groupAchievementsByCategory,
  mergeAchievementProgress,
  normalizeEmail,
  normalizeText,
  pickShowcaseAchievements,
  rarityWeight,
  resultKind,
  slugifyText,
};
