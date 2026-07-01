import {
  emailDocumentId,
  loadAchievementsCatalog,
  loadUserProgress,
  saveUserProgress,
} from "./firebase-service.js";
import {
  buildAchievementProgressMap,
  buildAchievementStats,
  mergeAchievementProgress,
} from "./achievements-engine.js";
import { regularTimeScore } from "./match-score-utils.js";

async function syncUserAchievements({
  userEmail = "",
  quinielas = [],
  officialParticipants = [],
  matches = [],
  rankingPosition = null,
  officialCount = 0,
} = {}) {
  const cleanEmail = String(userEmail || "").trim();
  const documentId = cleanEmail ? emailDocumentId(cleanEmail) : "";
  const rankingQuinielas = dedupeQuinielas([
    ...(Array.isArray(quinielas) ? quinielas : []),
    ...(Array.isArray(officialParticipants) ? officialParticipants : []),
  ]);
  const [catalog, existingProgress] = await Promise.all([
    loadAchievementsCatalog(),
    documentId ? loadUserProgress(documentId) : Promise.resolve({ logrosQuiniela: {}, estadisticasQuiniela: {} }),
  ]);

  const stats = buildAchievementStats({
    quinielas: rankingQuinielas,
    matches,
    userEmail: cleanEmail,
    rankingPosition,
    officialCount,
  });
  const previousProgress = existingProgress?.logrosQuiniela || {};
  const previousStats = existingProgress?.estadisticasQuiniela || {};
  const progressMap = buildAchievementProgressMap(catalog, stats, previousProgress);
  const mergedProgress = mergeAchievementProgress(previousProgress, progressMap);
  const mergedProgressWithPresentation = Object.fromEntries(
    Object.entries(catalog || {}).map(([id, achievement]) => {
      const baseProgress = mergedProgress[id] || { progress: 0, unlocked: false, unlockedAt: null };
      const presentation = buildAchievementPresentation(achievement, stats, rankingQuinielas, matches);
      return [id, applyAchievementPresentation(baseProgress, presentation)];
    }),
  );
  const unlockedAtNow = new Date().toISOString();
  Object.entries(mergedProgressWithPresentation).forEach(([id, value]) => {
    if (value?.unlocked && !value.unlockedAt) {
      value.unlockedAt = unlockedAtNow;
      if (progressMap[id]) progressMap[id].unlockedAt = unlockedAtNow;
    }
  });
  const nextStats = normalizeStatsForWrite(stats);
  const changed =
    JSON.stringify(normalizeForWrite(previousProgress)) !== JSON.stringify(normalizeForWrite(mergedProgressWithPresentation)) ||
    JSON.stringify(normalizeStatsForWrite(previousStats)) !== JSON.stringify(nextStats);

  if (changed && documentId) {
    await saveUserProgress(documentId, mergedProgressWithPresentation, nextStats);
  }

  const achievements = Object.entries(catalog || {}).map(([id, achievement]) => {
    const baseProgress = mergedProgressWithPresentation[id] || { progress: 0, unlocked: false, unlockedAt: null };
    const presentation = buildAchievementPresentation(achievement, stats, rankingQuinielas, matches);
    return {
      id,
      ...(achievement || {}),
      ...baseProgress,
      ...presentation,
    };
  });

  return {
    achievements,
    catalog,
    existingProgress: previousProgress,
    existingStats: previousStats,
    progressMap,
    mergedProgress,
    stats: nextStats,
    documentId,
    changed,
  };
}

function normalizeForWrite(progressMap) {
  return Object.fromEntries(
    Object.entries(progressMap || {}).map(([id, value]) => [
      id,
      {
        progress: Number(value?.progress) || 0,
        unlocked: Boolean(value?.unlocked),
        unlockedAt: value?.unlockedAt || null,
        desbloqueadoEnQuiniela: value?.desbloqueadoEnQuiniela || value?.unlockedQuinielaName || null,
        partidoDesbloqueo: value?.partidoDesbloqueo || value?.unlockedMatchLabel || null,
        banderasPartidoDesbloqueo: value?.banderasPartidoDesbloqueo || value?.unlockedFlags || null,
      },
    ]),
  );
}

function applyAchievementPresentation(progress = {}, presentation = {}) {
  const next = { ...(progress && typeof progress === "object" ? progress : {}) };
  if (!next.unlocked) return next;

  const unlockedQuiniela =
    presentation.unlockedQuinielaName ||
    presentation.unlockedQuinielaNames ||
    presentation.bestQuinielaName ||
    presentation.bestQuinielaNames ||
    next.desbloqueadoEnQuiniela ||
    next.unlockedQuinielaName ||
    next.unlockedQuinielaNames ||
    null;
  const partyLabel =
    presentation.unlockedMatchLabel ||
    presentation.bestMatchLabel ||
    presentation.progressMatchLabel ||
    next.partidoDesbloqueo ||
    next.unlockedMatchLabel ||
    null;
  const partyFlags =
    presentation.unlockedFlags ||
    presentation.bestFlags ||
    presentation.progressFlags ||
    next.banderasPartidoDesbloqueo ||
    next.unlockedFlags ||
    null;

  if (unlockedQuiniela) {
    next.desbloqueadoEnQuiniela = unlockedQuiniela;
    next.unlockedQuinielaName = unlockedQuiniela;
    next.unlockedQuinielaNames = unlockedQuiniela;
  }
  if (partyLabel) {
    next.partidoDesbloqueo = partyLabel;
    next.unlockedMatchLabel = partyLabel;
  }
  if (partyFlags) {
    next.banderasPartidoDesbloqueo = partyFlags;
    next.unlockedFlags = partyFlags;
  }

  return next;
}

function normalizeStatsForWrite(stats) {
  return {
    exactosTotales: Number(stats?.exactosTotales) || 0,
    contrariosExactos: Number(stats?.contrariosExactos) || 0,
    jornadasSinPuntosConsecutivas: Number(stats?.jornadasSinPuntosConsecutivas) || 0,
    jornadasSinPuntosMaximas: Number(stats?.jornadasSinPuntosMaximas) || 0,
    jornadasUltimoLugarConsecutivas: Number(stats?.jornadasUltimoLugarConsecutivas) || 0,
    jornadasUltimoLugarMaximas: Number(stats?.jornadasUltimoLugarMaximas) || 0,
    jornadasConCeroPuntos: Number(stats?.jornadasConCeroPuntos) || 0,
    mejorJornadaExactos: Number(stats?.mejorJornadaExactos) || 0,
    partidosSinPuntosConsecutivos: Number(stats?.partidosSinPuntosConsecutivos) || 0,
    partidosSinPuntosMaximos: Number(stats?.partidosSinPuntosMaximos) || 0,
    puntosUltimoPartidoJornada: Boolean(stats?.puntosUltimoPartidoJornada),
    puntosUltimoPartidoJornadaCount: Number(stats?.puntosUltimoPartidoJornadaCount) || 0,
    liderAntesDelFinal: Boolean(stats?.liderAntesDelFinal),
    ultimoPartidoEvaluado: stats?.ultimoPartidoEvaluado || null,
    ultimaJornadaEvaluada: stats?.ultimaJornadaEvaluada || null,
    posicionUsuario: Number(stats?.posicionUsuario) || null,
    totalUsuarios: Number(stats?.totalUsuarios) || 0,
    posicionFinal: Number(stats?.posicionFinal) || null,
    maxExactosTotales: Number(stats?.maxExactosTotales) || 0,
    maxPuntosTotales: Number(stats?.maxPuntosTotales) || 0,
  };
}

function dedupeQuinielas(items = []) {
  const seen = new Set();
  const output = [];
  items.forEach((item, index) => {
    const key =
      String(item?.cloudId || item?.cloudMapKey || "").trim() ||
      [
        String(item?.userEmail || item?.email || "").trim().toLowerCase(),
        String(item?.quinielaName || item?.name || "").trim().toLowerCase(),
        String(item?.propietarioName || item?.owner || "").trim().toLowerCase(),
      ]
        .filter(Boolean)
        .join("|") ||
      `item-${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });
  return output;
}

function buildAchievementPresentation(achievement, stats, quinielas = [], matches = []) {
  const title = String(achievement?.title || achievement?.id || "").toLowerCase();
  const description = String(achievement?.description || "").toLowerCase();
  const haystack = `${title} ${description}`;
  if (!isDocumentAchievement(achievement)) return {};
  const summaries = Array.isArray(stats?.quinielaSummaries) ? stats.quinielaSummaries : [];
  const normalizedSummaries = summaries.map((summary) => ({
    ...summary,
    label: summary?.label || summary?.quinielaName || summary?.name || "Quiniela",
  }));

  const byMetric = (metric) => {
    const ordered = [...normalizedSummaries].sort(
      (a, b) =>
        (Number(b?.[metric]) || 0) - (Number(a?.[metric]) || 0) ||
        String(a.label).localeCompare(String(b.label), "es"),
    );
    const bestValue = Number(ordered[0]?.[metric]) || 0;
    const winners = ordered.filter((item) => Number(item?.[metric]) === bestValue && bestValue > 0);
    return {
      bestValue,
      winners,
      chosen: ordered[0] || null,
    };
  };

  const formatNames = (items) => {
    const names = [...new Set(items.map((item) => item.label).filter(Boolean))];
    if (!names.length) return "";
    if (names.length === 1) return names[0];
    return names.join(" · ");
  };

  const matchFlags = (match) => {
    if (!match) return "";
    const flags = [match.homeFlag, match.awayFlag].filter(Boolean);
    return flags.join(" ");
  };

  const matchLabel = (match) => {
    if (!match) return "";
    const home = [match.homeFlag, match.homeTeam].find(Boolean) || "Local";
    const away = [match.awayFlag, match.awayTeam].find(Boolean) || "Visitante";
    return `${home} vs ${away}`;
  };

  const trace = (summary) => traceDocumentAchievement(achievement, findQuinielaBySummary(summary, quinielas), matches);
  const presentationForMetric = (metric, { useCurrentAsBest = false } = {}) => {
    const metricData = byMetric(metric);
    const traceData = trace(metricData.chosen);
    return {
      progress: metricData.bestValue,
      bestProgress: metricData.bestValue,
      bestRachaLabel: "Mejor racha",
      bestQuinielaName: metricData.chosen?.label || "Quiniela",
      bestQuinielaNames: formatNames(metricData.winners || []),
      achievedByNames: formatNames(metricData.winners || []),
      progressQuinielaName: metricData.chosen?.label || "Quiniela",
      progressQuinielaNames: formatNames(metricData.winners || []),
      unlockedQuinielaName: metricData.chosen?.label || "Quiniela",
      unlockedQuinielaNames: formatNames(metricData.winners || []),
      progressFlags: matchFlags(traceData.progressMatch),
      bestFlags: matchFlags(useCurrentAsBest ? traceData.progressMatch : traceData.bestMatch),
      unlockedFlags: matchFlags(traceData.progressMatch || traceData.bestMatch),
      progressMatchLabel: matchLabel(traceData.progressMatch),
      bestMatchLabel: matchLabel(useCurrentAsBest ? traceData.progressMatch : traceData.bestMatch),
      unlockedMatchLabel: matchLabel(traceData.progressMatch || traceData.bestMatch),
    };
  };

  if (haystack.includes("autogol") || haystack.includes("manitas")) {
    const currentMetric = byMetric("partidosSinPuntosConsecutivos");
    const bestMetric = byMetric("partidosSinPuntosMaximos");
    const currentTrace = trace(currentMetric.chosen);
    const bestTrace = trace(bestMetric.chosen);
    const activeStreak = Number(currentTrace.currentValue) || 0;
    return {
      progress: activeStreak > 0 ? activeStreak : 0,
      bestProgress: bestMetric.bestValue,
      bestRachaLabel: "Mejor racha",
      bestRacha: bestMetric.bestValue,
      bestQuinielaName: bestMetric.chosen?.label || "Quiniela",
      bestQuinielaNames: formatNames(bestMetric.winners || []),
      achievedByNames: formatNames(bestMetric.winners || []),
      progressQuinielaName: currentMetric.chosen?.label || "Quiniela",
      progressQuinielaNames: formatNames(currentMetric.winners || []),
      unlockedQuinielaName: bestMetric.chosen?.label || "Quiniela",
      unlockedQuinielaNames: formatNames(bestMetric.winners || []),
      progressFlags: matchFlags(currentTrace.progressMatch),
      bestFlags: matchFlags(bestTrace.bestMatch),
      unlockedFlags: matchFlags(bestTrace.bestMatch || currentTrace.progressMatch),
      progressMatchLabel: matchLabel(currentTrace.progressMatch),
      bestMatchLabel: matchLabel(bestTrace.bestMatch),
      unlockedMatchLabel: matchLabel(bestTrace.bestMatch || currentTrace.progressMatch),
    };
  }

  if (haystack.includes("naufrago")) {
    const currentMetric = byMetric("jornadasUltimoLugarConsecutivas");
    const bestMetric = byMetric("jornadasUltimoLugarMaximas");
    const currentTrace = trace(currentMetric.chosen);
    const bestTrace = trace(bestMetric.chosen);
    const activeStreak = Number(currentTrace.currentValue) || 0;
    return {
      progress: activeStreak > 0 ? activeStreak : 0,
      bestProgress: bestMetric.bestValue,
      bestRachaLabel: "Mejor racha",
      bestRacha: bestMetric.bestValue,
      bestQuinielaName: bestMetric.chosen?.label || "Quiniela",
      bestQuinielaNames: formatNames(bestMetric.winners || []),
      achievedByNames: formatNames(bestMetric.winners || []),
      progressQuinielaName: currentMetric.chosen?.label || "Quiniela",
      progressQuinielaNames: formatNames(currentMetric.winners || []),
      unlockedQuinielaName: bestMetric.chosen?.label || "Quiniela",
      unlockedQuinielaNames: formatNames(bestMetric.winners || []),
      progressFlags: matchFlags(currentTrace.progressMatch),
      bestFlags: matchFlags(bestTrace.bestMatch),
      unlockedFlags: matchFlags(bestTrace.bestMatch || currentTrace.progressMatch),
      progressMatchLabel: matchLabel(currentTrace.progressMatch),
      bestMatchLabel: matchLabel(bestTrace.bestMatch),
      unlockedMatchLabel: matchLabel(bestTrace.bestMatch || currentTrace.progressMatch),
    };
  }

  if (haystack.includes("pichichi")) {
    const bestMetric = byMetric("bestBigMarginExacts");
    const currentTrace = trace(bestMetric.chosen);
    return {
      bestRachaLabel: null,
      bestProgress: Number(stats?.bestBigMarginExacts) || 0,
      bestQuinielaName: bestMetric.chosen?.label || "Quiniela",
      bestQuinielaNames: formatNames(bestMetric.winners || []),
      achievedByNames: formatNames(bestMetric.winners || []),
      unlockedQuinielaName: bestMetric.chosen?.label || "Quiniela",
      unlockedQuinielaNames: formatNames(bestMetric.winners || []),
      progressFlags: matchFlags(currentTrace.progressMatch),
      bestFlags: matchFlags(currentTrace.bestMatch),
      unlockedFlags: matchFlags(currentTrace.bestMatch || currentTrace.progressMatch),
      progressMatchLabel: matchLabel(currentTrace.progressMatch),
      bestMatchLabel: matchLabel(currentTrace.bestMatch),
      unlockedMatchLabel: matchLabel(currentTrace.bestMatch || currentTrace.progressMatch),
    };
  }

  if (haystack.includes("francotirador")) {
    const bestMetric = byMetric("exacts");
    const fallbackExacts =
      Number(stats?.exactosTotales) ||
      Number(stats?.totalExacts) ||
      Number(stats?.bestExacts) ||
      Number(bestMetric.bestValue) ||
      0;
    const traceData = trace(bestMetric.chosen);
    return {
      progress: fallbackExacts,
      bestProgress: fallbackExacts,
      bestRachaLabel: null,
      bestQuinielaName: bestMetric.chosen?.label || "Quiniela",
      bestQuinielaNames: formatNames(bestMetric.winners || []),
      achievedByNames: formatNames(bestMetric.winners || []),
      unlockedQuinielaName: bestMetric.chosen?.label || "Quiniela",
      unlockedQuinielaNames: formatNames(bestMetric.winners || []),
      progressQuinielaName: bestMetric.chosen?.label || "Quiniela",
      progressQuinielaNames: formatNames(bestMetric.winners || []),
      progressFlags: matchFlags(traceData.progressMatch),
      bestFlags: matchFlags(traceData.bestMatch),
      unlockedFlags: matchFlags(traceData.bestMatch || traceData.progressMatch),
      progressMatchLabel: matchLabel(traceData.progressMatch),
      bestMatchLabel: matchLabel(traceData.bestMatch),
      unlockedMatchLabel: matchLabel(traceData.bestMatch || traceData.progressMatch),
    };
  }

  if (haystack.includes("anti")) {
    return presentationForMetric("invertedExacts", { useCurrentAsBest: true });
  }

  if (haystack.includes("gol al 90")) {
    return presentationForMetric("puntosUltimoPartidoJornadaCount", { useCurrentAsBest: true });
  }

  if (haystack.includes("hat trick") || haystack.includes("hattrick")) {
    return presentationForMetric("bestJornadaExacts", { useCurrentAsBest: true });
  }

  if (haystack.includes("no era penal")) {
    return presentationForMetric("jornadasConCeroPuntos", { useCurrentAsBest: true });
  }

  if (haystack.includes("bota de oro")) {
    return presentationForMetric("exacts", { useCurrentAsBest: true });
  }

  const fallbackSummary = stats?.bestSummary || normalizedSummaries[0] || null;
  const fallbackTrace = trace(fallbackSummary);

  return {
    bestProgress: Number(baseProgressForAchievement(achievement, stats)) || 0,
    bestQuinielaName: fallbackSummary?.label || "Quiniela",
    bestQuinielaNames: fallbackSummary?.label || "",
    progressQuinielaName: fallbackSummary?.label || "Quiniela",
    progressQuinielaNames: fallbackSummary?.label || "",
    unlockedQuinielaName: fallbackSummary?.label || "Quiniela",
    unlockedQuinielaNames: fallbackSummary?.label || "",
    progressFlags: matchFlags(fallbackTrace.progressMatch),
    bestFlags: matchFlags(fallbackTrace.bestMatch),
    unlockedFlags: matchFlags(fallbackTrace.bestMatch || fallbackTrace.progressMatch),
    progressMatchLabel: matchLabel(fallbackTrace.progressMatch),
    bestMatchLabel: matchLabel(fallbackTrace.bestMatch),
    unlockedMatchLabel: matchLabel(fallbackTrace.bestMatch || fallbackTrace.progressMatch),
  };
}

function baseProgressForAchievement(achievement, stats) {
  if (!isDocumentAchievement(achievement)) return 0;
  const text = String(achievement?.title || achievement?.description || "").toLowerCase();
  if (text.includes("gol al 90")) return Number(stats?.puntosUltimoPartidoJornadaCount) || 0;
  if (text.includes("francotirador")) return Number(stats?.exactosTotales) || 0;
  if (text.includes("anti")) return Number(stats?.contrariosExactos) || 0;
  if (text.includes("no era penal")) return Number(stats?.jornadasConCeroPuntos) || 0;
  if (text.includes("bota de oro")) return Number(stats?.exactosTotales) || 0;
  if (text.includes("seleccion mexicana")) return Number(stats?.liderAntesDelFinal && stats?.posicionFinal && stats.posicionFinal !== 1 ? 1 : 0) || 0;
  return Number(stats?.bestScore) || 0;
}

function isDocumentAchievement(achievement) {
  const haystack = String([achievement?.id, achievement?.title, achievement?.description].filter(Boolean).join(" "))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function findQuinielaBySummary(summary, quinielas = []) {
  if (!summary) return null;
  const label = String(summary.label || "").trim().toLowerCase();
  const email = String(summary.userEmail || "").trim().toLowerCase();
  const id = String(summary.id || "").trim().toLowerCase();
  return (
    quinielas.find((item) => {
      const itemLabel = String(item?.quinielaName || item?.name || "").trim().toLowerCase();
      const itemEmail = String(item?.userEmail || item?.email || "").trim().toLowerCase();
      const itemId = String(item?.cloudId || item?.cloudMapKey || item?.id || "").trim().toLowerCase();
      return (label && itemLabel === label) || (email && itemEmail === email) || (id && itemId === id);
    }) || null
  );
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

function traceDocumentAchievement(achievement, quiniela, matches = []) {
  if (!quiniela || !achievement) return { progressMatch: null, bestMatch: null };

  const title = normalizeText(achievement?.title || achievement?.id || "");
  const results = quiniela?.results && typeof quiniela.results === "object" ? quiniela.results : (() => {
    try {
      return JSON.parse(quiniela?.resultsJson || "{}");
    } catch {
      return {};
    }
  })();
  const orderedMatches = [...matches].sort(
    (a, b) =>
      String(a?.date || "").localeCompare(String(b?.date || ""), "es") ||
      String(a?.time || "").localeCompare(String(b?.time || ""), "es"),
  );

  const pointsForMatch = (match, index = 0) => {
    const real = match?.finished ? regularTimeScore(match) : null;
    if (!real) return 0;
    const prediction = getPredictionForMatch(results, match, index);
    const { home, away } = readPredictionScores(prediction);
    if (home == null || away == null) return 0;
    const [realHome, realAway] = real;
    return home === realHome && away === realAway ? 2 : resultKind(home, away) === resultKind(realHome, realAway) ? 1 : 0;
  };

  const exactMatch = (match, index = 0) => {
    const real = regularTimeScore(match);
    const prediction = getPredictionForMatch(results, match, index);
    const { home, away } = readPredictionScores(prediction);
    if (home == null || away == null || !real) return false;
    return home === real[0] && away === real[1];
  };

  const invertedExactMatch = (match, index = 0) => {
    const real = regularTimeScore(match);
    const prediction = getPredictionForMatch(results, match, index);
    const { home, away } = readPredictionScores(prediction);
    if (home == null || away == null || !real) return false;
    return home === real[1] && away === real[0] && !exactMatch(match, index);
  };

  let progressMatch = null;
  let bestMatch = null;
  let currentValue = 0;
  let bestValue = 0;

  if (title.includes("autogol") || title.includes("manitas")) {
    let streak = 0;
    let bestStreak = 0;
    let lastNoPoint = null;
    orderedMatches.forEach((match, index) => {
      if (!match.finished || !regularTimeScore(match)) return;
      const points = pointsForMatch(match, index);
      if (points > 0) {
        streak = 0;
        return;
      }
      streak += 1;
      lastNoPoint = match;
      if (streak >= bestStreak) {
        bestStreak = streak;
        bestMatch = lastNoPoint;
      }
      if (progressMatch == null) progressMatch = lastNoPoint;
      currentValue = streak;
    });
    bestValue = bestStreak;
    if (!progressMatch) progressMatch = bestMatch;
    return { progressMatch, bestMatch, currentValue, bestValue };
  }

  if (title.includes("francotirador")) {
    let exacts = 0;
    orderedMatches.forEach((match, index) => {
      if (!exactMatch(match, index)) return;
      exacts += 1;
      progressMatch = match;
      bestMatch = match;
    });
    return { progressMatch, bestMatch, currentValue: exacts, bestValue: exacts };
  }

  if (title.includes("pichichi")) {
    let count = 0;
    orderedMatches.forEach((match, index) => {
      if (!exactMatch(match, index)) return;
      const [home, away] = regularTimeScore(match);
      const margin = Math.abs(home - away);
      if (margin < 4) return;
      count += 1;
      progressMatch = match;
      bestMatch = match;
    });
    return { progressMatch, bestMatch, currentValue: count, bestValue: count };
  }

  if (title.includes("anti")) {
    let count = 0;
    orderedMatches.forEach((match, index) => {
      if (!invertedExactMatch(match, index)) return;
      count += 1;
      progressMatch = match;
      bestMatch = match;
    });
    return { progressMatch, bestMatch, currentValue: count, bestValue: count };
  }

  if (title.includes("gol al 90")) {
    let count = 0;
    const byDate = new Map();
    orderedMatches.forEach((match, index) => {
      if (!match.finished) return;
      if (!byDate.has(match.date)) byDate.set(match.date, []);
      byDate.get(match.date).push(match);
    });
    orderedMatches.forEach((match, index) => {
      if (!match.finished || pointsForMatch(match, index) <= 0) return;
      const dayMatches = byDate.get(match.date) || [];
      const lastOfDay = dayMatches[dayMatches.length - 1];
      if (lastOfDay?.id === match.id) {
        count += 1;
        progressMatch = match;
        bestMatch = match;
      }
    });
    return { progressMatch, bestMatch, currentValue: count, bestValue: count };
  }

  if (title.includes("hat trick") || title.includes("hattrick")) {
    const jornadaCounts = new Map();
    orderedMatches.forEach((match, index) => {
      if (!exactMatch(match, index)) return;
      const key = String(match.date || match.group || "");
      const next = (jornadaCounts.get(key) || 0) + 1;
      jornadaCounts.set(key, next);
      progressMatch = match;
      if (next >= (Number(achievement?.target) || 0)) bestMatch = match;
    });
    bestValue = Math.max(...jornadaCounts.values(), 0);
    currentValue = bestValue;
    if (!bestMatch) bestMatch = progressMatch;
    return { progressMatch, bestMatch, currentValue, bestValue };
  }

  if (title.includes("no era penal")) {
    const jornadaPoints = new Map();
    const jornadaLastMatch = new Map();
    orderedMatches.forEach((match, index) => {
      if (!match.finished) return;
      const key = String(match.date || match.group || "");
      jornadaPoints.set(key, (jornadaPoints.get(key) || 0) + pointsForMatch(match, index));
      jornadaLastMatch.set(key, match);
    });
    let zeroCount = 0;
    [...jornadaPoints.entries()].forEach(([key, points]) => {
      if (points === 0) {
        zeroCount += 1;
        progressMatch = jornadaLastMatch.get(key) || progressMatch;
        bestMatch = jornadaLastMatch.get(key) || bestMatch;
      }
    });
    return { progressMatch, bestMatch, currentValue: zeroCount, bestValue: zeroCount };
  }

  const lastFinished = [...orderedMatches].reverse().find((match) => match.finished);
  return { progressMatch: lastFinished, bestMatch: lastFinished, currentValue: 0, bestValue: 0 };
}

export { syncUserAchievements };
