import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyApgnc-co80Na8bX9S_ngpj1HCd_Qn6yMI",
  authDomain: "quiniela-malenka-2026.firebaseapp.com",
  projectId: "quiniela-malenka-2026",
  storageBucket: "quiniela-malenka-2026.firebasestorage.app",
  messagingSenderId: "758271571145",
  appId: "1:758271571145:web:20618c86e5d8af01c34918",
};

const app = getApps()[0] || initializeApp(firebaseConfig);
const db = getFirestore(app);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function emailDocumentId(email) {
  return normalizeEmail(email).replace("@", "_").replaceAll(".", "_");
}

function sentDocumentId(quiniela) {
  return `${normalizeEmail(quiniela.userEmail)}_${quiniela.quinielaName}_${quiniela.propietarioName}`
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll(".", "_")
    .replaceAll("@", "_");
}

function savedMapKey(quiniela) {
  const suffix = quiniela.isKnockout ? " (KO)" : "";
  return `${String(quiniela.quinielaName || "").trim()} - ${String(
    quiniela.propietarioName || "",
  ).trim()}${suffix}`;
}

function parseObject(value) {
  if (typeof value === "object" && value !== null) return value;
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function parseOfficialScore(value) {
  if (value == null || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function resolveBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function normalizeMatchCode(value, matches) {
  const raw = String(value || "").trim();
  if (!raw || raw.toLowerCase() === "null") return null;
  const upper = raw.toUpperCase();
  const aliases = {
    "3RD_PLACE": "3RD",
    "3ER_LUGAR": "3RD",
    TERCER_LUGAR: "3RD",
    THIRD_PLACE: "3RD",
    FINAL: "FIN",
    FINALE: "FIN",
  };
  if (aliases[upper]) return aliases[upper];
  const numeric = upper.startsWith("M") ? Number(upper.slice(1)) : Number(upper);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= matches.length) {
    return matches[numeric - 1].id;
  }
  return upper;
}

function readStringFromObject(value) {
  if (value == null) return null;
  if (typeof value === "object") {
    const nestedKeys = ["name", "team", "teamName", "nombre", "displayName", "shortName", "value"];
    for (const key of nestedKeys) {
      const nested = readStringFromObject(value[key]);
      if (nested) return nested;
    }
    return null;
  }
  const text = String(value).trim();
  return text && text.toLowerCase() !== "null" ? text : null;
}

function readCaseInsensitive(source, key) {
  if (!source || typeof source !== "object") return null;
  const foundKey = Object.keys(source).find((item) => item.toLowerCase() === key.toLowerCase());
  return foundKey ? source[foundKey] : null;
}

function readStringFromSources(sources, keys) {
  for (const key of keys) {
    for (const source of sources) {
      const value = readStringFromObject(readCaseInsensitive(source, key));
      if (value) return value;
    }
  }
  return null;
}

function readNestedStringFromSources(sources, paths) {
  for (const path of paths) {
    for (const source of sources) {
      let current = source;
      for (const key of path) {
        current = readCaseInsensitive(current, key);
        if (current == null) break;
      }
      const value = readStringFromObject(current);
      if (value) return value;
    }
  }
  return null;
}

function resolvedTeam(currentTeam, candidateTeam) {
  return candidateTeam && candidateTeam.toLowerCase() !== "por definir"
    ? candidateTeam
    : currentTeam;
}

function readMatchTeam(data, elements, side, currentTeam) {
  const sources = [data, elements].filter(Boolean);
  const isHome = side === "home";
  const directKeys = isHome
    ? [
        "homeTeam",
        "homeTeamName",
        "home",
        "localTeam",
        "localTeamName",
        "equipoLocal",
        "local",
        "teamHome",
        "team1",
        "homeName",
        "localName",
      ]
    : [
        "awayTeam",
        "awayTeamName",
        "away",
        "visitorTeam",
        "visitorTeamName",
        "visitanteTeam",
        "visitanteTeamName",
        "equipoVisitante",
        "visitante",
        "teamAway",
        "team2",
        "awayName",
        "visitorName",
        "visitanteName",
      ];
  const nestedPaths = isHome
    ? [
        ["home", "team"],
        ["home", "name"],
        ["local", "team"],
        ["local", "name"],
        ["teams", "home"],
        ["teams", "local"],
        ["participants", "home"],
        ["participants", "local"],
      ]
    : [
        ["away", "team"],
        ["away", "name"],
        ["visitor", "team"],
        ["visitor", "name"],
        ["visitante", "team"],
        ["visitante", "name"],
        ["teams", "away"],
        ["teams", "visitor"],
        ["teams", "visitante"],
        ["participants", "away"],
        ["participants", "visitor"],
        ["participants", "visitante"],
      ];
  return resolvedTeam(
    currentTeam,
    readStringFromSources(sources, directKeys) || readNestedStringFromSources(sources, nestedPaths),
  );
}

function readMatchStadium(data, elements, current = {}) {
  const sources = [data, elements].filter(Boolean);
  const stadiumName =
    readStringFromSources(sources, ["stadiumName", "venueName", "stadium"]) ||
    current.stadiumName ||
    "";
  const stadiumFifaName =
    readStringFromSources(sources, ["stadiumFifaName", "fifaStadiumName"]) ||
    current.stadiumFifaName ||
    "";
  const stadiumCity =
    readStringFromSources(sources, ["stadiumCity", "city", "venueCity"]) ||
    current.stadiumCity ||
    "";
  const stadiumCountry =
    readStringFromSources(sources, ["stadiumCountry", "country", "venueCountry"]) ||
    current.stadiumCountry ||
    "";
  const stadiumCountryCode =
    readStringFromSources(sources, ["stadiumCountryCode", "countryCode"]) ||
    current.stadiumCountryCode ||
    "";
  const stadiumLocation =
    readStringFromSources(sources, ["stadiumLocation", "venueLocation", "location"]) ||
    [stadiumCity, stadiumCountry].filter(Boolean).join(", ") ||
    current.stadiumLocation ||
    "";
  const stadiumRegion =
    readStringFromSources(sources, ["stadiumRegion", "region"]) ||
    current.stadiumRegion ||
    "";
  const stadiumTimeZone =
    readStringFromSources(sources, ["stadiumTimeZone", "timeZone", "timezone"]) ||
    current.stadiumTimeZone ||
    "";

  return {
    stadiumName,
    stadiumFifaName,
    stadiumCity,
    stadiumCountry,
    stadiumCountryCode,
    stadiumLocation,
    stadiumRegion,
    stadiumTimeZone,
  };
}

function toFirestoreData(quiniela, status) {
  const isKnockout = Boolean(quiniela.isKnockout);
  const winners = parseObject(quiniela.winnersJson);
  return {
    quinielaName: String(quiniela.quinielaName || "").trim(),
    propietarioName: String(quiniela.propietarioName || "").trim(),
    userEmail: normalizeEmail(quiniela.userEmail),
    quinielaCode: String(quiniela.quinielaCode || "").trim(),
    results: parseObject(quiniela.resultsJson),
    ...(isKnockout ? { winners } : { groupWinners: winners }),
    isKnockout,
    isGroups: !isKnockout,
    updatedAt: Date.now(),
    status,
    emailStatus: "pending",
    paymentReceived: Boolean(quiniela.paymentReceived),
  };
}

function cloudDataToLocal(data, options = {}) {
  const isKnockout = Boolean(data.isKnockout || options.isKnockout);
  return {
    id: options.id || crypto.randomUUID(),
    cloudId: options.cloudId || null,
    cloudMapKey: options.cloudMapKey || null,
    quinielaName: data.quinielaName || "Sin nombre",
    propietarioName: data.propietarioName || "Anónimo",
    userEmail: normalizeEmail(data.userEmail || options.email),
    quinielaCode: data.quinielaCode || "",
    resultsJson: JSON.stringify(data.results || {}),
    winnersJson: JSON.stringify(isKnockout ? data.winners || {} : data.groupWinners || {}),
    isSent: options.isSent ?? data.status === "received",
    isKnockout,
    isFavorite: false,
    paymentReceived: Boolean(data.paymentReceived),
    points: null,
  };
}

function mergeCloudQuinielas(localItems, cloudItems) {
  const merged = [...localItems];
  cloudItems.forEach((cloudItem) => {
    const index = merged.findIndex(
      (item) =>
        item.quinielaName === cloudItem.quinielaName &&
        item.propietarioName === cloudItem.propietarioName &&
        Boolean(item.isKnockout) === Boolean(cloudItem.isKnockout),
    );
    if (index >= 0) {
      merged[index] = {
        ...merged[index],
        ...cloudItem,
        id: merged[index].id,
        isFavorite: merged[index].isFavorite,
      };
    } else {
      merged.push(cloudItem);
    }
  });
  return merged;
}

function observeMatches(baseMatches, onChange, onError = () => {}) {
  return onSnapshot(
    collection(db, "matches"),
    (snapshot) => {
      const byDocumentId = new Map(snapshot.docs.map((item) => [item.id, item.data()]));
      const byMatchCode = new Map(
        snapshot.docs.flatMap((item) => {
          const data = item.data();
          const codes = [
            data?.elements?.matchCode,
            data?.matchCode,
            data?.elements?.docId,
            data?.docId,
            data?.elements?.firebaseDocId,
            data?.firebaseDocId,
            data?.elements?.matchNumber,
            data?.matchNumber,
            item.id,
          ];
          return codes
            .map((code) => normalizeMatchCode(code, baseMatches))
            .filter(Boolean)
            .map((code) => [code, data]);
        }),
      );

      const updated = baseMatches.map((match, index) => {
        const expectedId = `M${String(index + 1).padStart(2, "0")}`;
        let data =
          byDocumentId.get(expectedId) ||
          byDocumentId.get(match.firebaseDocId) ||
          byMatchCode.get(match.id);
        const elements = data?.elements || data;
        const status = String(elements?.status || data?.status || "").toUpperCase();
        return data
          ? {
              ...match,
              ...readMatchStadium(data, elements, match),
              homeTeam: readMatchTeam(data, elements, "home", match.homeTeam),
              awayTeam: readMatchTeam(data, elements, "away", match.awayTeam),
              homeFlag: readStringFromSources([data, elements], ["homeFlag", "localFlag", "flagHome", "banderaLocal"]) || match.homeFlag,
              awayFlag: readStringFromSources([data, elements], ["awayFlag", "visitorFlag", "visitanteFlag", "flagAway", "banderaVisitante"]) || match.awayFlag,
              realHomeScore: parseOfficialScore(
                readCaseInsensitive(elements, "homeScore") ?? readCaseInsensitive(elements, "golesLocal"),
              ),
              realAwayScore: parseOfficialScore(
                readCaseInsensitive(elements, "awayScore") ?? readCaseInsensitive(elements, "golesVisitante"),
              ),
              started:
                resolveBoolean(elements.started) ||
                status === "IN_PLAY" ||
                status === "LIVE" ||
                status === "FINISHED",
              finished: resolveBoolean(elements.finished) || status === "FINISHED",
              isActive: resolveBoolean(elements.isActive) || status === "IN_PLAY" || status === "LIVE",
              firebaseId: expectedId,
            }
          : { ...match };
      });
      onChange(updated);
    },
    onError,
  );
}

async function getAccessCodes() {
  const snapshot = await getDoc(doc(db, "codigos", "creados"));
  return snapshot.exists() ? snapshot.data() : {};
}

async function validateAccessCode(code) {
  const cleanCode = String(code || "").trim();
  if (!cleanCode) return { ok: true, title: "Sin Código" };
  const codes = await getAccessCodes();
  const entry = Object.entries(codes).find(
    ([, value]) => String(value).trim() === cleanCode,
  );
  return entry
    ? {
        ok: true,
        title: entry[0].replace(/(?<=.)(?=[A-ZÁÉÍÓÚÑ])/g, " "),
      }
    : {
        ok: false,
        title: "Sin Código",
        message:
          "Código incorrecto. Respeta mayúsculas, minúsculas y espacios.",
      };
}

async function getUserAdminStatus(email) {
  const documentId = emailDocumentId(email);
  if (!documentId) return false;
  const snapshot = await getDoc(doc(db, "guardadas", documentId));
  return snapshot.exists() ? Boolean(snapshot.get("isAdmin")) : false;
}

async function verifyAdminPassword(email, password) {
  const documentId = emailDocumentId(email);
  if (!documentId || !String(password || "")) return false;
  const snapshot = await getDoc(doc(db, "codigos", "correos"));
  return snapshot.exists() && snapshot.get(documentId) === password;
}

async function loadAppConfig() {
  const snapshot = await getDoc(doc(db, "codigos", "quinielaActiva"));
  const data = snapshot.exists() ? snapshot.data() : {};
  return {
    faseGrupos: Boolean(data.faseGrupos ?? true),
    faseFinal: Boolean(data.faseFinal ?? true),
    visibleGroups: Boolean(data.visibleGroups ?? true),
    visibleFinal: Boolean(data.visibleFinal ?? false),
  };
}

async function updateAppConfig(patch) {
  await setDoc(doc(db, "codigos", "quinielaActiva"), patch, { merge: true });
}

async function loadQuinielasByEmail(email) {
  const currentEmail = normalizeEmail(email);
  if (!currentEmail) return [];

  const sentQuery = query(
    collection(db, "quinielas"),
    where("userEmail", "==", currentEmail),
  );
  const [sentSnapshot, sentMapSnapshot, savedSnapshot] = await Promise.all([
    getDocs(sentQuery),
    getDoc(doc(db, "quinielas", emailDocumentId(currentEmail))),
    getDoc(doc(db, "guardadas", emailDocumentId(currentEmail))),
  ]);

  const sent = [
    ...sentSnapshot.docs.flatMap((item) =>
      cloudDocumentToLocalItems(item.id, item.data(), currentEmail, true),
    ),
    ...(sentMapSnapshot.exists()
      ? cloudDocumentToLocalItems(sentMapSnapshot.id, sentMapSnapshot.data(), currentEmail, true)
      : []),
  ];

  const saved = savedSnapshot.exists()
    ? Object.entries(savedSnapshot.data())
        .filter(
          ([, data]) =>
            data &&
            typeof data === "object" &&
            String(data.quinielaName || "").trim() &&
            String(data.propietarioName || "").trim() &&
            data.results &&
            typeof data.results === "object",
        )
        .map(([mapKey, data]) =>
          cloudDataToLocal(data, {
            cloudMapKey: mapKey,
            email: currentEmail,
            isSent: data?.status === "received",
            isKnockout: Boolean(data?.isKnockout || mapKey.endsWith("(KO)")),
          }),
        )
    : [];

  return mergeCloudQuinielas(saved, sent);
}

function cloudDocumentToLocalItems(id, data, email, isSent) {
  if (!data || typeof data !== "object") return [];
  if (data.results && typeof data.results === "object") {
    return [
      cloudDataToLocal(data, {
        cloudId: id,
        email,
        isSent,
        isKnockout: Boolean(data.isKnockout),
      }),
    ];
  }
  return Object.entries(data)
    .filter(([, value]) => value && typeof value === "object" && value.results)
    .map(([mapKey, value]) =>
      cloudDataToLocal(value, {
        cloudId: id,
        cloudMapKey: mapKey,
        email,
        isSent: value.status === "received" || isSent,
        isKnockout: Boolean(value.isKnockout || mapKey.endsWith("(KO)")),
      }),
    );
}

async function loadOfficialParticipants(accessCode) {
  const cleanCode = String(accessCode || "").trim();
  if (!cleanCode) return [];
  const participantQuery = query(
    collection(db, "quinielas"),
    where("quinielaCode", "==", cleanCode),
    where("paymentReceived", "==", true),
  );
  const [flatSnapshot, allSnapshot] = await Promise.all([
    getDocs(participantQuery),
    getDocs(collection(db, "quinielas")),
  ]);
  const flatItems = flatSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  const mapItems = allSnapshot.docs.flatMap((item) =>
    Object.entries(item.data() || {})
      .filter(([, value]) => value && typeof value === "object")
      .filter(
        ([, value]) =>
          String(value.quinielaCode || "").trim() === cleanCode && value.paymentReceived === true,
      )
      .map(([mapKey, value]) => ({ id: `${item.id}_${mapKey}`, cloudMapKey: mapKey, ...value })),
  );
  return [...flatItems, ...mapItems];
}

function readJsonCache(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJsonCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache is opportunistic only.
  }
}

function normalizeAchievementProgressEntry(value) {
  if (typeof value === "number") {
    return {
      progress: Math.max(0, Number(value) || 0),
      unlocked: Number(value) > 0,
      unlockedAt: null,
      desbloqueadoEnQuiniela: null,
      partidoDesbloqueo: null,
      banderasPartidoDesbloqueo: null,
    };
  }
  if (!value || typeof value !== "object") {
    return {
      progress: 0,
      unlocked: false,
      unlockedAt: null,
      desbloqueadoEnQuiniela: null,
      partidoDesbloqueo: null,
      banderasPartidoDesbloqueo: null,
    };
  }

  const progress =
    Number.isFinite(Number(value.progress)) ? Number(value.progress) : Number(value.progreso) || 0;
  const unlocked =
    typeof value.unlocked === "boolean"
      ? value.unlocked
      : typeof value.desbloqueado === "boolean"
        ? value.desbloqueado
        : progress > 0;
  const unlockedAt = value.unlockedAt || value.fechaDesbloqueo || null;
  const target = Number.isFinite(Number(value.target)) ? Number(value.target) : null;
  const desbloqueadoEnQuiniela =
    value.desbloqueadoEnQuiniela ||
    value.unlockedQuinielaName ||
    value.unlockedQuinielaNames ||
    null;
  const partidoDesbloqueo =
    value.partidoDesbloqueo ||
    value.unlockedMatchLabel ||
    value.bestMatchLabel ||
    null;
  const banderasPartidoDesbloqueo =
    value.banderasPartidoDesbloqueo ||
    value.unlockedFlags ||
    value.bestFlags ||
    null;

  return {
    progress: Math.max(0, progress),
    unlocked,
    unlockedAt,
    target,
    desbloqueadoEnQuiniela,
    partidoDesbloqueo,
    banderasPartidoDesbloqueo,
  };
}

function serializeAchievementProgressEntry(value) {
  const normalized = normalizeAchievementProgressEntry(value);
  return {
    progreso: normalized.progress,
    desbloqueado: Boolean(normalized.unlocked),
    fechaDesbloqueo: normalized.unlockedAt || null,
    ...(Number.isFinite(Number(normalized.target)) ? { target: Number(normalized.target) } : {}),
    ...(normalized.desbloqueadoEnQuiniela ? { desbloqueadoEnQuiniela: normalized.desbloqueadoEnQuiniela } : {}),
    ...(normalized.partidoDesbloqueo ? { partidoDesbloqueo: normalized.partidoDesbloqueo } : {}),
    ...(normalized.banderasPartidoDesbloqueo
      ? { banderasPartidoDesbloqueo: normalized.banderasPartidoDesbloqueo }
      : {}),
  };
}

function normalizeAchievementProgressMap(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).map(([id, entry]) => [id, normalizeAchievementProgressEntry(entry)]),
  );
}

function serializeAchievementProgressMap(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).map(([id, entry]) => [id, serializeAchievementProgressEntry(entry)]),
  );
}

async function loadAchievementsCatalog() {
  const cacheKey = "quinielaMalenka.achievements.catalog";
  return readJsonCache(cacheKey, {});
}

async function loadUserAchievements(documentId) {
  return (await loadUserProgress(documentId)).logrosQuiniela;
}

async function loadUserProgress(documentId) {
  const cleanDocumentId = String(documentId || "").trim();
  if (!cleanDocumentId) return { logrosQuiniela: {}, estadisticasQuiniela: {} };

  const cacheKey = `quinielaMalenka.achievements.progress.${cleanDocumentId}`;
  const normalizePayload = (value) => {
    if (!value || typeof value !== "object") return { logrosQuiniela: {}, estadisticasQuiniela: {} };
    if ("logrosQuiniela" in value || "estadisticasQuiniela" in value) {
      return {
        logrosQuiniela: normalizeAchievementProgressMap(
          typeof value.logrosQuiniela === "object" && value.logrosQuiniela !== null ? value.logrosQuiniela : {},
        ),
        estadisticasQuiniela:
          typeof value.estadisticasQuiniela === "object" && value.estadisticasQuiniela !== null
            ? value.estadisticasQuiniela
            : {},
      };
    }
    return { logrosQuiniela: normalizeAchievementProgressMap(value), estadisticasQuiniela: {} };
  };
  return normalizePayload(readJsonCache(cacheKey, { logrosQuiniela: {}, estadisticasQuiniela: {} }));
}

function mergeAchievementsWithProgress(catalog, userProgress) {
  const entries = Array.isArray(catalog)
    ? catalog.map((item, index) => [String(item?.id || index), item])
    : Object.entries(catalog || {});

  return entries.map(([id, achievement]) => {
    const rawProgress = userProgress?.[id];
    const progressData =
      typeof rawProgress === "number"
        ? { progress: rawProgress }
        : rawProgress || {};

    return {
      id,
      title: achievement?.title || id,
      description: achievement?.description || "Sin descripción.",
      target: Math.max(0, Number(achievement?.target) || 0),
      category: achievement?.category || "Otros logros",
      rarity: achievement?.rarity || "Común",
      icon: achievement?.icon || "🏆",
      progress: Math.max(0, Number(progressData.progress) || 0),
      unlocked: Boolean(progressData.unlocked),
      unlockedAt: progressData.unlockedAt || null,
    };
  });
}

async function saveUserAchievements(documentId, achievementsProgress) {
  return saveUserProgress(documentId, achievementsProgress, {});
}

async function saveUserProgress(documentId, achievementsProgress, estadisticasQuiniela = {}) {
  const cleanDocumentId = String(documentId || "").trim();
  if (!cleanDocumentId) return;

  const normalizedProgress = serializeAchievementProgressMap(achievementsProgress || {});
  const reference = doc(db, "guardadas", cleanDocumentId);
  const payload = {
    logrosQuiniela: normalizedProgress,
    estadisticasQuiniela: estadisticasQuiniela || {},
  };
  const snapshot = await getDoc(reference);
  if (snapshot.exists()) {
    await updateDoc(reference, payload);
  } else {
    await setDoc(reference, payload);
  }
  writeJsonCache(
    `quinielaMalenka.achievements.progress.${cleanDocumentId}`,
    {
      logrosQuiniela: normalizeAchievementProgressMap(achievementsProgress || {}),
      estadisticasQuiniela: estadisticasQuiniela || {},
    },
  );
}

async function saveQuinielaCloud(quiniela) {
  const email = normalizeEmail(quiniela.userEmail);
  if (!email) throw new Error("La quiniela necesita un correo electrónico.");
  const data = toFirestoreData(quiniela, "saved");
  const documentId = emailDocumentId(email);
  const mapKey = savedMapKey(quiniela);
  await setDoc(doc(db, "guardadas", documentId), { [mapKey]: data }, { merge: true });
  return { documentId, mapKey };
}

async function sendQuinielaCloudLegacy(quiniela) {
  const email = normalizeEmail(quiniela.userEmail);
  if (!email) throw new Error("La quiniela necesita un correo electrónico.");
  const data = toFirestoreData(quiniela, "received");
  const documentId = sentDocumentId(quiniela);
  await setDoc(doc(db, "quinielas", documentId), data);
  let webhookDelivered = false;
  try {
    const response = await fetch(
      "https://n8n.beetikmx.com/webhook/quiniela-recibida",
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ ...data, documentId }),
      },
    );
    webhookDelivered = response.ok;
  } catch {
    // Firestore is the source of truth; the Android app also keeps the send
    // successful when the notification webhook is unavailable.
  }
  return { documentId, webhookDelivered };
}

async function sendQuinielaCloud(quiniela) {
  const email = normalizeEmail(quiniela.userEmail);
  if (!email) throw new Error("La quiniela necesita un correo electronico.");
  const data = toFirestoreData(quiniela, "received");
  const documentId = quiniela.isKnockout ? emailDocumentId(email) : sentDocumentId(quiniela);
  const mapKey = savedMapKey(quiniela);
  if (quiniela.isKnockout) {
    const existing = await getDoc(doc(db, "quinielas", documentId));
    const existingQuiniela = existing.exists() ? existing.get(mapKey) : null;
    if (existingQuiniela?.paymentReceived === true) {
      data.paymentReceived = true;
    }
  }
  await setDoc(
    doc(db, "quinielas", documentId),
    quiniela.isKnockout ? { [mapKey]: data } : data,
    { merge: Boolean(quiniela.isKnockout) },
  );
  let webhookDelivered = false;
  try {
    const response = await fetch(
      quiniela.isKnockout
        ? "https://n8n.beetikmx.com/webhook/quiniela-finales-recibida"
        : "https://n8n.beetikmx.com/webhook/quiniela-recibida",
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ ...data, documentId, ...(quiniela.isKnockout ? { mapKey } : {}) }),
      },
    );
    webhookDelivered = response.ok;
  } catch {
    // Firestore is the source of truth; the Android app also keeps the send
    // successful when the notification webhook is unavailable.
  }
  return { documentId, webhookDelivered };
}

async function deleteQuinielaCloud(quiniela, username, password) {
  const expectedUsername = emailDocumentId(quiniela.userEmail);
  if (String(username || "").trim() !== expectedUsername) {
    throw new Error("El username no coincide con el correo de la quiniela.");
  }

  const credentials = await getDoc(doc(db, "codigos", "correos"));
  if (!credentials.exists() || credentials.get(expectedUsername) !== password) {
    throw new Error("Password incorrecta o usuario no encontrado.");
  }

  const batch = writeBatch(db);
  const savedReference = doc(db, "guardadas", expectedUsername);
  batch.set(
    savedReference,
    { [savedMapKey(quiniela)]: deleteField() },
    { merge: true },
  );
  if (quiniela.isKnockout) {
    batch.set(
      doc(db, "quinielas", expectedUsername),
      { [savedMapKey(quiniela)]: deleteField() },
      { merge: true },
    );
  } else {
    batch.delete(doc(db, "quinielas", sentDocumentId(quiniela)));
  }
  await batch.commit();
}

export {
  db,
  deleteQuinielaCloud,
  emailDocumentId,
  loadAchievementsCatalog,
  loadOfficialParticipants,
  loadQuinielasByEmail,
  getUserAdminStatus,
  loadUserAchievements,
  loadUserProgress,
  loadAppConfig,
  mergeAchievementsWithProgress,
  mergeCloudQuinielas,
  normalizeEmail,
  observeMatches,
  saveQuinielaCloud,
  saveUserAchievements,
  saveUserProgress,
  sendQuinielaCloud,
  updateAppConfig,
  verifyAdminPassword,
  validateAccessCode,
};
