import {
  emailDocumentId,
  loadAchievementsCatalog,
  loadUserAchievements,
  mergeAchievementsWithProgress,
} from "./firebase-service.js";

const USER_KEY = "quinielaMalenka.user";
const statusElement = document.getElementById("achievementsStatus");
const contentElement = document.getElementById("achievementsContent");

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

function groupByCategory(achievements) {
  return achievements.reduce((groups, achievement) => {
    (groups[achievement.category] ||= []).push(achievement);
    return groups;
  }, {});
}

function rarityClass(rarity) {
  return String(rarity).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function iconMarkup(icon, title) {
  const value = String(icon || "🏆").trim();
  if (/^https?:\/\//i.test(value)) {
    return `<img src="${escapeHtml(value)}" alt="" loading="lazy" />`;
  }
  const shortIcon = value.length <= 4 ? value : value.slice(0, 3).toUpperCase();
  return `<span aria-hidden="true">${escapeHtml(shortIcon)}</span><span class="sr-only">${escapeHtml(title)}</span>`;
}

function achievementCard(achievement) {
  const percent = achievement.target
    ? Math.min(100, Math.round((achievement.progress / achievement.target) * 100))
    : achievement.unlocked ? 100 : 0;
  const stateLabel = achievement.unlocked ? "Desbloqueado" : "Bloqueado";

  return `<article class="achievement-card ${achievement.unlocked ? "is-unlocked" : "is-locked"}" tabindex="0">
    <div class="achievement-icon">${iconMarkup(achievement.icon, achievement.title)}</div>
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
    </div>
    ${achievement.unlocked ? '<span class="state-icon" title="Desbloqueado">✓</span>' : '<span class="state-icon" title="Bloqueado">🔒</span>'}
  </article>`;
}

function renderAchievements(achievements) {
  if (!achievements.length) {
    showStatus("empty", "Aún no hay logros", "El catálogo de Firestore está vacío.");
    return;
  }

  const unlocked = achievements.filter((item) => item.unlocked).length;
  const groups = groupByCategory(achievements);
  contentElement.innerHTML = `
    <section class="summary-card"><div><strong>${unlocked}</strong><span>desbloqueados</span></div><div><strong>${achievements.length}</strong><span>logros totales</span></div></section>
    ${Object.entries(groups).map(([category, items]) => `
      <section class="achievement-group">
        <div class="group-title"><h2>${escapeHtml(category)}</h2><span>${items.filter((item) => item.unlocked).length}/${items.length}</span></div>
        <div class="achievements-grid">${items.map(achievementCard).join("")}</div>
      </section>`).join("")}`;
  statusElement.hidden = true;
  contentElement.hidden = false;
}

function showStatus(type, title, message) {
  statusElement.className = `status-card status-${type}`;
  statusElement.innerHTML = `<span class="status-symbol" aria-hidden="true">${type === "error" ? "!" : "🏆"}</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>`;
  statusElement.hidden = false;
  contentElement.hidden = true;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character],
  );
}

async function initAchievements() {
  const user = getCurrentUser();
  try {
    const [catalog, progress] = await Promise.all([
      loadAchievementsCatalog(),
      user?.email ? loadUserAchievements(emailDocumentId(user.email)) : Promise.resolve({}),
    ]);
    renderAchievements(mergeAchievementsWithProgress(catalog, progress));
  } catch (error) {
    console.error("No fue posible cargar los logros:", error);
    showStatus("error", "No pudimos cargar tus logros", "Revisa tu conexión e inténtalo de nuevo.");
  }
}

initAchievements();
