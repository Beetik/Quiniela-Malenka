import {
  emailDocumentId,
  loadAchievementsCatalog,
  loadUserProgress,
} from "./firebase-service.js";
import {
  badgeUrlForAchievement,
  calculateQuinielaStats,
  groupAchievementsByCategory,
} from "./achievements-engine.js";
import { syncUserAchievements } from "./achievements-sync.js";
import { MATCHES } from "./matches-data.js";

const USER_KEY = "quinielaMalenka.user";
const STORAGE_KEY = "quinielaMalenka.saved";
const OFFICIAL_KEY = "quinielaMalenka.sent";

const statusElement = document.getElementById("achievementsStatus");
const contentElement = document.getElementById("achievementsContent");

let currentUser = getCurrentUser();
let currentMatches = MATCHES;

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

function getSavedQuinielas() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function getOfficialQuiniela() {
  try {
    return JSON.parse(localStorage.getItem(OFFICIAL_KEY) || "null");
  } catch {
    return null;
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getOwnedQuinielas(email) {
  const cleanEmail = normalizeEmail(email);
  const localItems = getSavedQuinielas().filter(
    (quiniela) => normalizeEmail(quiniela.userEmail || quiniela.email) === cleanEmail,
  );
  const official = getOfficialQuiniela();
  const officialItems =
    official && normalizeEmail(official.email) === cleanEmail ? [official] : [];
  return [...localItems, ...officialItems];
}

function getParticipatingQuinielas(email, items) {
  const cleanEmail = normalizeEmail(email);
  return (items || []).filter(
    (quiniela) =>
      normalizeEmail(quiniela.userEmail || quiniela.email) === cleanEmail &&
      Boolean(quiniela.isSent) &&
      Boolean(quiniela.paymentReceived),
  );
}

function showStatus(type, title, message) {
  statusElement.className = `status-card status-${type}`;
  statusElement.innerHTML = `<span class="status-symbol" aria-hidden="true">${type === "error" ? "!" : "🏆"}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
  statusElement.hidden = false;
  contentElement.hidden = true;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ],
  );
}

function groupByCategory(achievements) {
  return groupAchievementsByCategory(achievements);
}

function rarityClass(rarity) {
  return String(rarity)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function achievementScope(achievement) {
  const text = `${achievement?.title || ""} ${achievement?.description || ""}`.toLowerCase();
  if (/autogol|manitas|pichichi|francotirador|anti[- ]?or[áa]culo|gol al 90|gol al 90'/.test(text)) {
    return "partidos";
  }
  if (/hat[- ]?trick|no era penal|n[áa]ufrago|bota de oro|selecci[óo]n mexicana en penales/.test(text)) {
    return "jornadas";
  }
  return "torneo";
}

function scopeLabel(scope) {
  return (
    {
      partidos: "Partidos",
      jornadas: "Jornadas",
      torneo: "Torneo / global",
    }[scope] || scope
  );
}

function achievementCard(achievement) {
  const percent = achievement.target
    ? Math.min(100, Math.round((achievement.progress / achievement.target) * 100))
    : achievement.unlocked
      ? 100
      : 0;
  const stateLabel = achievement.unlocked ? "Desbloqueado" : "Bloqueado";
  const fallbackBestProgress = Number(achievement.bestProgress);
  const bestProgress = Number.isFinite(fallbackBestProgress)
    ? fallbackBestProgress
    : Number(achievement.progress) || 0;
  const bestRachaVisible = !achievement.unlocked;
  const progressSource =
    achievement.progressQuinielaNames ||
    achievement.progressQuinielaName ||
    achievement.desbloqueadoEnQuiniela ||
    "";
  const bestSource = achievement.bestQuinielaNames || achievement.bestQuinielaName || "";
  const unlockedSource =
    achievement.desbloqueadoEnQuiniela ||
    achievement.unlockedQuinielaNames ||
    achievement.unlockedQuinielaName ||
    bestSource ||
    progressSource ||
    achievement.achievedByNames ||
    "Sin identificar";
  const achievedBy = achievement.achievedByNames || "";
  const progressFlags = achievement.progressFlags || achievement.bestFlags || "";
  const bestFlags = achievement.bestFlags || achievement.progressFlags || "";
  const unlockedFlags =
    achievement.banderasPartidoDesbloqueo ||
    achievement.unlockedFlags ||
    progressFlags ||
    bestFlags;
  const unlockedMatch =
    achievement.partidoDesbloqueo ||
    achievement.unlockedMatchLabel ||
    achievement.bestMatchLabel ||
    achievement.progressMatchLabel ||
    "Sin identificar";
  const lockedSource = bestSource || progressSource;
  const lockedFlags = bestFlags || progressFlags;
  const unlockedSourceLabel = unlockedSource;
  const unlockedFlagsLabel = unlockedFlags || unlockedMatch;

  return `<article class="achievement-card ${achievement.unlocked ? "is-unlocked" : "is-locked"}" tabindex="0">
    <div class="achievement-icon">
      <img src="${badgeUrlForAchievement(achievement)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='./images/logros/default.svg';" />
    </div>
    <div class="achievement-main">
      <div class="achievement-heading">
        <h3>${escapeHtml(achievement.title)}</h3>
        <span class="rarity rarity-${rarityClass(achievement.rarity)}">${escapeHtml(achievement.rarity)}</span>
      </div>
      <p class="achievement-description">${escapeHtml(achievement.description)}</p>
      <div class="progress-label"><span>${escapeHtml(stateLabel)}</span><strong>${achievement.progress} / ${achievement.target}</strong></div>
      <div class="progress-track" role="progressbar" aria-label="Progreso de ${escapeHtml(achievement.title)}" aria-valuemin="0" aria-valuemax="${achievement.target}" aria-valuenow="${Math.min(achievement.progress, achievement.target)}">
        <span style="width: ${percent}%"></span>
      </div>
      ${
        bestRachaVisible
          ? `<div class="achievement-meta"><span>Mejor racha</span><strong>${bestProgress} / ${achievement.target}</strong></div>`
          : ""
      }
      ${
        achievement.unlocked
            ? `<div class="achievement-sources">
              <p><span>Desbloqueó:</span> ${escapeHtml(unlockedSourceLabel)}</p>
              <p><span>Partido:</span> ${escapeHtml(unlockedFlagsLabel)}</p>
              ${achievedBy && achievedBy !== unlockedSourceLabel ? `<p><span>Involucradas:</span> ${escapeHtml(achievedBy)}</p>` : ""}
            </div>`
          : (lockedSource || lockedFlags
              ? `<div class="achievement-sources">
                  ${lockedSource ? `<p><span>Mejor quiniela:</span> ${escapeHtml(lockedSource)}</p>` : ""}
                  ${lockedFlags ? `<p><span>Equipos de la mejor racha:</span> ${escapeHtml(lockedFlags)}</p>` : ""}
                  ${progressSource && progressSource !== lockedSource ? `<p><span>Racha actual:</span> ${escapeHtml(progressSource)}</p>` : ""}
                  ${progressFlags && progressFlags !== lockedFlags ? `<p><span>Último punto:</span> ${escapeHtml(progressFlags)}</p>` : ""}
                </div>`
              : "")
      }
    </div>
    ${achievement.unlocked ? '<span class="state-icon" title="Desbloqueado">✓</span>' : '<span class="state-icon" title="Bloqueado">🔒</span>'}
  </article>`;
}

function renderAchievements(achievements) {
  if (!achievements.length) {
    showStatus("empty", "Aún no hay logros", "El catálogo de Firestore está vacío.");
    return;
  }

  const unlockedCount = achievements.filter((item) => item.unlocked).length;
  const groups = groupByCategory(achievements);
  const scopedGroups = Object.entries(groups).reduce((acc, [category, items]) => {
    items.forEach((item) => {
      const scope = achievementScope(item);
      (acc[scope] ||= []).push({ category, item });
    });
    return acc;
  }, {});

  contentElement.innerHTML = `
    <section class="summary-card">
      <div><strong>${unlockedCount}</strong><span>desbloqueados</span></div>
      <div><strong>${achievements.length}</strong><span>logros totales</span></div>
    </section>
    <section class="scope-legend" aria-label="Tipos de logros">
      <span class="scope-pill scope-partidos">Partidos</span>
      <span class="scope-pill scope-jornadas">Jornadas</span>
      <span class="scope-pill scope-torneo">Torneo / global</span>
    </section>
    ${["partidos", "jornadas", "torneo"]
      .filter((scope) => (scopedGroups[scope] || []).length)
      .map((scope) => {
        const items = scopedGroups[scope] || [];
        const groupedByCategory = items.reduce((acc, entry) => {
          (acc[entry.category] ||= []).push(entry.item);
          return acc;
        }, {});

        return `
      <section class="scope-section scope-${scope}">
        <div class="scope-title">
          <div>
            <span class="scope-kicker">${scopeLabel(scope)}</span>
            <h2>${scope === "torneo" ? "Logros globales" : `Logros de ${scopeLabel(scope).toLowerCase()}`}</h2>
          </div>
          <span>${items.filter((entry) => entry.item.unlocked).length}/${items.length}</span>
        </div>
        <div class="scope-cards">
          ${Object.entries(groupedByCategory)
            .map(
              ([category, categoryItems]) => `
            <section class="achievement-group">
              <div class="group-title"><h3>${escapeHtml(category)}</h3><span>${categoryItems.filter((item) => item.unlocked).length}/${categoryItems.length}</span></div>
              <div class="achievements-grid">${categoryItems.map(achievementCard).join("")}</div>
            </section>`,
            )
            .join("")}
        </div>
      </section>`;
      })
      .join("")}`;
  statusElement.hidden = true;
  contentElement.hidden = false;
}

function parseRankingPositionFromScores(ownedQuinielas, currentMatchesToUse) {
  if (!Array.isArray(ownedQuinielas) || !ownedQuinielas.length) return null;
  const bestScore = ownedQuinielas.reduce(
    (best, quiniela) => Math.max(best, calculateQuinielaStats(quiniela, currentMatchesToUse).totalPoints),
    0,
  );
  return bestScore > 0 ? 1 : null;
}

async function loadAchievementsView() {
  const user = currentUser;
  if (!statusElement || !contentElement) return;

  try {
    const catalog = await loadAchievementsCatalog();
    const localQuinielas = user?.email ? getOwnedQuinielas(user.email) : [];
    const participatingQuinielas = user?.email
      ? getParticipatingQuinielas(user.email, localQuinielas)
      : [];

    const rankingPosition = parseRankingPositionFromScores(participatingQuinielas, currentMatches);
    const { achievements } = await syncUserAchievements({
      userEmail: user?.email || "",
      quinielas: participatingQuinielas,
      officialParticipants: [],
      matches: currentMatches,
      rankingPosition,
      officialCount: 0,
    });

    renderAchievements(achievements);
  } catch (error) {
    console.error("No fue posible cargar los logros:", error);
    try {
      const catalog = await loadAchievementsCatalog();
      const documentId = user?.email ? emailDocumentId(user.email) : "";
      const stored = documentId
        ? await loadUserProgress(documentId).catch(() => ({ logrosQuiniela: {} }))
        : { logrosQuiniela: {} };
      const achievements = Object.entries(catalog || {}).map(([id, achievement]) => {
        const saved = stored?.logrosQuiniela?.[id] || {};
        return {
          id,
          ...(achievement || {}),
          progress: Number(saved.progress) || 0,
          unlocked: Boolean(saved.unlocked),
          unlockedAt: saved.unlockedAt || null,
          target: Math.max(0, Number(achievement?.target) || 0),
        };
      });
      renderAchievements(achievements);
      return;
    } catch (fallbackError) {
      console.error("Tampoco fue posible usar el catálogo local:", fallbackError);
      showStatus("error", "No pudimos cargar tus logros", "Revisa tu conexión e inténtalo de nuevo.");
    }
  }
}

loadAchievementsView();
