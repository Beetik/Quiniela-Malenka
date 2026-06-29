const DEFAULT_MATCH_TIME_ZONE = "America/Mexico_City";

function readDateParts(date, time = "00:00") {
  const [year, month, day] = String(date).split("-").map(Number);
  const [hour = 0, minute = 0] = String(time).split(":").map(Number);
  return { year, month, day, hour, minute };
}

function dateTimeFormatParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function partsToUtc(parts) {
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second || 0),
  );
}

function zonedMatchDate(date, time, timeZone = DEFAULT_MATCH_TIME_ZONE) {
  const parts = readDateParts(date, time);
  if (!parts.year || !parts.month || !parts.day) return new Date(NaN);

  const targetAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    0,
  );
  const utcGuess = new Date(targetAsUtc);
  const actualAsUtc = partsToUtc(dateTimeFormatParts(utcGuess, timeZone));

  return new Date(targetAsUtc + (targetAsUtc - actualAsUtc));
}

function matchTimeZone(match) {
  const timeZone = match?.kickoffTimeZone || DEFAULT_MATCH_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_MATCH_TIME_ZONE;
  }
}

function matchInstant(match) {
  return zonedMatchDate(match?.date, match?.time, matchTimeZone(match));
}

function matchTimestamp(match) {
  return matchInstant(match).getTime();
}

function formatLocalMatchDate(match, options = {}) {
  return new Intl.DateTimeFormat("es-MX", {
    weekday: options.weekday,
    day: "numeric",
    month: options.month || "short",
  })
    .format(matchInstant(match))
    .replace(".", "")
    .replace(",", "");
}

function formatLocalMatchTime(match, options = {}) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...(options.timeZoneName ? { timeZoneName: "short" } : {}),
  }).format(matchInstant(match));
}

function sameLocalKickoff(a, b) {
  return matchTimestamp(a) === matchTimestamp(b);
}

export {
  DEFAULT_MATCH_TIME_ZONE,
  formatLocalMatchDate,
  formatLocalMatchTime,
  matchInstant,
  matchTimestamp,
  sameLocalKickoff,
};
