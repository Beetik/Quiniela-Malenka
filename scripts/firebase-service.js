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
  return `${String(quiniela.quinielaName || "").trim()} - ${String(
    quiniela.propietarioName || "",
  ).trim()}`;
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

function toFirestoreData(quiniela, status) {
  return {
    quinielaName: String(quiniela.quinielaName || "").trim(),
    propietarioName: String(quiniela.propietarioName || "").trim(),
    userEmail: normalizeEmail(quiniela.userEmail),
    quinielaCode: String(quiniela.quinielaCode || "").trim(),
    results: parseObject(quiniela.resultsJson),
    groupWinners: parseObject(quiniela.winnersJson),
    updatedAt: Date.now(),
    status,
    emailStatus: "pending",
    paymentReceived: Boolean(quiniela.paymentReceived),
  };
}

function cloudDataToLocal(data, options = {}) {
  return {
    id: options.id || crypto.randomUUID(),
    cloudId: options.cloudId || null,
    cloudMapKey: options.cloudMapKey || null,
    quinielaName: data.quinielaName || "Sin nombre",
    propietarioName: data.propietarioName || "Anónimo",
    userEmail: normalizeEmail(data.userEmail || options.email),
    quinielaCode: data.quinielaCode || "",
    resultsJson: JSON.stringify(data.results || {}),
    winnersJson: JSON.stringify(data.groupWinners || {}),
    isSent: options.isSent ?? data.status === "received",
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
        item.propietarioName === cloudItem.propietarioName,
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
        snapshot.docs
          .map((item) => item.data())
          .filter((data) => data?.elements?.matchCode)
          .map((data) => [data.elements.matchCode, data]),
      );

      const updated = baseMatches.map((match, index) => {
        const expectedId = `M${String(index + 1).padStart(2, "0")}`;
        let data = byDocumentId.get(expectedId);
        if (data?.elements?.matchCode !== match.id) {
          data = byMatchCode.get(match.id);
        }
        const elements = data?.elements;
        return elements
          ? {
              ...match,
              realHomeScore: parseOfficialScore(elements.homeScore),
              realAwayScore: parseOfficialScore(elements.awayScore),
              started: Boolean(elements.started),
              finished: Boolean(elements.finished),
              isActive: Boolean(elements.isActive),
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

async function loadQuinielasByEmail(email) {
  const currentEmail = normalizeEmail(email);
  if (!currentEmail) return [];

  const sentQuery = query(
    collection(db, "quinielas"),
    where("userEmail", "==", currentEmail),
  );
  const [sentSnapshot, savedSnapshot] = await Promise.all([
    getDocs(sentQuery),
    getDoc(doc(db, "guardadas", emailDocumentId(currentEmail))),
  ]);

  const sent = sentSnapshot.docs.map((item) =>
    cloudDataToLocal(item.data(), {
      cloudId: item.id,
      email: currentEmail,
      isSent: true,
    }),
  );

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
          }),
        )
    : [];

  return mergeCloudQuinielas(saved, sent);
}

async function loadOfficialParticipants(accessCode) {
  const cleanCode = String(accessCode || "").trim();
  if (!cleanCode) return [];
  const participantQuery = query(
    collection(db, "quinielas"),
    where("quinielaCode", "==", cleanCode),
    where("paymentReceived", "==", true),
  );
  const snapshot = await getDocs(participantQuery);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function loadAchievementsCatalog() {
  const snapshot = await getDoc(doc(db, "achievements", "groupAchievements"));
  if (!snapshot.exists()) return {};

  const achievements = snapshot.data()?.logros;
  return typeof achievements === "object" && achievements !== null
    ? achievements
    : {};
}

async function loadUserAchievements(documentId) {
  const cleanDocumentId = String(documentId || "").trim();
  if (!cleanDocumentId) return {};

  const snapshot = await getDoc(doc(db, "guardadas", cleanDocumentId));
  if (!snapshot.exists()) return {};

  const progress = snapshot.data()?.logrosQuiniela;
  return typeof progress === "object" && progress !== null ? progress : {};
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

async function saveQuinielaCloud(quiniela) {
  const email = normalizeEmail(quiniela.userEmail);
  if (!email) throw new Error("La quiniela necesita un correo electrónico.");
  const data = toFirestoreData(quiniela, "saved");
  const documentId = emailDocumentId(email);
  const mapKey = savedMapKey(quiniela);
  await setDoc(doc(db, "guardadas", documentId), { [mapKey]: data }, { merge: true });
  return { documentId, mapKey };
}

async function sendQuinielaCloud(quiniela) {
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
  batch.delete(doc(db, "quinielas", sentDocumentId(quiniela)));
  await batch.commit();
}

export {
  db,
  deleteQuinielaCloud,
  emailDocumentId,
  loadAchievementsCatalog,
  loadOfficialParticipants,
  loadQuinielasByEmail,
  loadUserAchievements,
  mergeAchievementsWithProgress,
  mergeCloudQuinielas,
  normalizeEmail,
  observeMatches,
  saveQuinielaCloud,
  sendQuinielaCloud,
  validateAccessCode,
};
