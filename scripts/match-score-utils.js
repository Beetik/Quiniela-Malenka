const REGULAR_TIME_LIMIT = 90;
const KNOCKOUT_GROUPS = new Set([
  "16avos de Final",
  "Octavos de Final",
  "Cuartos de Final",
  "Semifinales",
  "Tercer Lugar",
  "Final",
]);

function isKnockoutMatch(match) {
  return KNOCKOUT_GROUPS.has(match?.group);
}

function rawScore(match) {
  if (match?.realHomeScore == null || match?.realAwayScore == null) return null;
  return [Number(match.realHomeScore), Number(match.realAwayScore)];
}

function goalMinuteToken(item) {
  const text = String(item || "");
  const matches = [...text.matchAll(/(\d{1,3})\s*(?:'\s*)?(?:\+\s*\d{1,2})?\s*'?/g)];
  if (!matches.length) return null;
  const token = matches[matches.length - 1][0].replace(/\s+/g, "");
  const baseMinute = Number.parseInt(matches[matches.length - 1][1], 10);
  return Number.isFinite(baseMinute) ? { token, baseMinute } : null;
}

function isRegularTimeGoal(item) {
  const minute = goalMinuteToken(item);
  if (!minute) return true;
  return minute.baseMinute <= REGULAR_TIME_LIMIT;
}

function regularTimeScore(match) {
  const final = rawScore(match);
  if (!isKnockoutMatch(match)) return final;
  const homeScorers = Array.isArray(match?.homeScorers) ? match.homeScorers : [];
  const awayScorers = Array.isArray(match?.awayScorers) ? match.awayScorers : [];
  const hasScorers = homeScorers.length || awayScorers.length;
  if (!hasScorers) return final;
  return [
    Math.min(homeScorers.filter(isRegularTimeGoal).length, final?.[0] ?? Number.MAX_SAFE_INTEGER),
    Math.min(awayScorers.filter(isRegularTimeGoal).length, final?.[1] ?? Number.MAX_SAFE_INTEGER),
  ];
}

function finalScore(match) {
  return rawScore(match);
}

function extraTimeScore(match) {
  const regular = regularTimeScore(match);
  const final = finalScore(match);
  if (!regular || !final) return null;
  return final[0] !== regular[0] || final[1] !== regular[1] ? final : null;
}

function scoreText(score, fallback = "-") {
  return score ? `${score[0]} - ${score[1]}` : fallback;
}

function compactScoreText(score, fallback = "-") {
  return score ? `${score[0]}-${score[1]}` : fallback;
}

function extraTimeMarkup(match, escapeHtml, className = "extra-time-row", tagName = "div") {
  const extra = extraTimeScore(match);
  if (!extra) return "";
  const tag = tagName === "span" ? "span" : "div";
  return `<${tag} class="${className}"><span>Tiempo Extra:</span><strong>${escapeHtml(scoreText(extra))}</strong></${tag}>`;
}

export {
  compactScoreText,
  extraTimeMarkup,
  extraTimeScore,
  finalScore,
  isRegularTimeGoal,
  regularTimeScore,
  scoreText,
};
