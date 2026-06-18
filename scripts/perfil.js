import {
  emailDocumentId,
  loadAchievementsCatalog,
  loadQuinielasByEmail,
  loadUserAchievements,
  mergeAchievementsWithProgress,
  mergeCloudQuinielas,
  validateAccessCode,
} from "./firebase-service.js";

const USER_KEY = "quinielaMalenka.user";
const STORAGE_KEY = "quinielaMalenka.saved";
const OFFICIAL_KEY = "quinielaMalenka.sent";

const $ = (id) => document.getElementById(id);
const content = $("profileContent");
const settingsBtn = $("settingsBtn");
let user = getUser();

function getUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}
function saveUser(nextUser) {
  user = nextUser;
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
  renderProfile();
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
  return String(email || "")
    .trim()
    .toLowerCase();
}
function initialOf(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
}
async function validateCode(code) {
  try {
    return await validateAccessCode(code);
  } catch {
    if (user?.accessCode === code && user.rankTitle) {
      return { ok: true, title: user.rankTitle, offline: true };
    }
    return { ok: true, title: "Sin conexión", offline: true };
  }
}
function profileStats() {
  if (!user) return { count: 0, best: 0 };
  const email = normalizeEmail(user.email);
  const saved = getSavedQuinielas().filter(
    (q) => normalizeEmail(q.userEmail || q.email) === email,
  );
  const official = getOfficialQuiniela();
  const officialMatches =
    official && normalizeEmail(official.email) === email ? [official] : [];
  const uniqueKeys = new Set(
    [...saved, ...officialMatches].map(
      (q) =>
        q.cloudId ||
        q.key ||
        `${q.userEmail || q.email}_${q.quinielaName || q.name}_${q.propietarioName || q.owner}`,
    ),
  );
  return { count: uniqueKeys.size, best: Number(user.bestScore || 0) };
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2400);
}
function renderProfile() {
  settingsBtn.style.visibility = user ? "visible" : "hidden";
  content.innerHTML = user ? loggedTemplate() : notLoggedTemplate();
  bindProfileEvents();
  if (user) loadProfileAchievements();
}
function loggedTemplate() {
  const stats = profileStats();
  const title = user.rankTitle || "Sin Código";
  return `
    <section class="profile-card">
      <div class="avatar">${escapeHtml(initialOf(user.name))}</div>
      <div>
        <h2 class="profile-name">${escapeHtml(user.name)} 👑</h2>
        <p class="profile-rank">${escapeHtml(title)}</p>
        <p class="profile-email">${escapeHtml(user.email)}</p>
      </div>
    </section>

    <section class="stats-grid">
      ${statBox("Quinielas", stats.count, "creadas")}
      ${statBox("Mejor Puntaje", stats.best, "puntos")}
      ${statBox("Posición", "#---", "en ranking")}
      ${statBox("Aciertos", "---", "globales")}
    </section>

    <section class="profile-achievements-section">
      <div class="achievements-heading">
        <h2 class="section-title">Mis logros <span id="achievementCount">—/—</span></h2>
        <a class="view-all-achievements" href="logros.html">Ver todos</a>
      </div>
      <div id="profileAchievements" class="achievements achievements-loading">
        <p>Cargando logros…</p>
      </div>
    </section>

    <section class="menu-list">
      <button id="syncBtn" class="menu-item" type="button"><span>Cargar mis quinielas (Cloud)</span><span class="menu-icon">☁️</span></button>
      <button id="openSettingsBtn" class="menu-item" type="button"><span>Configuración</span><span class="menu-icon">›</span></button>
      <button id="logoutBtn" class="menu-item danger" type="button"><span>Cerrar sesión</span><span>−</span></button>
    </section>`;
}
function notLoggedTemplate() {
  return `
    <section class="not-logged">
      <div class="avatar">👤</div>
      <h2>Aún no has iniciado sesión</h2>
      <p class="profile-email">Inicia sesión o crea una cuenta para personalizar tu perfil y participar en la quiniela.</p>
      <div class="locked-list">
        ${lockedItem("👤", "Tu información", "Edita tu nombre, foto y más")}
        ${lockedItem("▮", "Tu rendimiento", "Consulta tus estadísticas y precisión")}
        ${lockedItem("🏆", "Tus logros", "Revisa tus trofeos y reconocimientos")}
        ${lockedItem("👥", "Tus amigos", "Gestiona tus amigos y listas personalizadas")}
      </div>
      <div class="login-bottom"><button id="loginOpenBtn" class="gold-btn full-width" type="button">↪ INICIAR SESIÓN</button></div>
    </section>`;
}
function statBox(label, value, footer) {
  return `<article class="stat-box"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(footer)}</small></article>`;
}
async function loadProfileAchievements() {
  const achievementsElement = $("profileAchievements");
  const countElement = $("achievementCount");
  if (!achievementsElement || !countElement || !user?.email) return;
  const requestedEmail = normalizeEmail(user.email);

  try {
    const [catalog, progress] = await Promise.all([
      loadAchievementsCatalog(),
      loadUserAchievements(emailDocumentId(requestedEmail)),
    ]);
    if (requestedEmail !== normalizeEmail(user?.email) || !achievementsElement.isConnected) return;

    const achievements = mergeAchievementsWithProgress(catalog, progress);
    const unlocked = achievements
      .filter((item) => item.unlocked)
      .sort(compareAchievementHierarchy);
    countElement.textContent = `${unlocked.length}/${achievements.length}`;
    achievementsElement.classList.remove("achievements-loading");
    achievementsElement.innerHTML = unlocked.length
      ? unlocked.slice(0, 6).map(profileAchievement).join("")
      : '<p class="achievements-empty">Aún no has desbloqueado logros.</p>';
  } catch (error) {
    console.error("No fue posible cargar los logros del perfil:", error);
    countElement.textContent = "0/—";
    achievementsElement.classList.remove("achievements-loading");
    achievementsElement.innerHTML = '<p class="achievements-empty">No pudimos cargar tus logros.</p>';
  }
}

function compareAchievementHierarchy(a, b) {
  const hierarchy = { "común": 1, raro: 2, "épico": 3, legendario: 4, "mítico": 5 };
  const rarityA = hierarchy[String(a.rarity).trim().toLowerCase()] || 0;
  const rarityB = hierarchy[String(b.rarity).trim().toLowerCase()] || 0;
  return rarityB - rarityA || Number(b.target) - Number(a.target) || a.title.localeCompare(b.title, "es");
}

function profileAchievement(achievement) {
  const icon = String(achievement.icon || "🏆").trim();
  const shortIcon = icon.length <= 4 ? icon : icon.slice(0, 3).toUpperCase();
  return `<article title="${escapeHtml(achievement.description)}">
    <div class="achievement-icon">${escapeHtml(shortIcon)}</div>
    <span class="achievement-title">${escapeHtml(achievement.title)}</span>
    <span class="achievement-status">${escapeHtml(achievement.rarity)}</span>
  </article>`;
}
function lockedItem(icon, title, subtitle) {
  return `<button class="locked-item" type="button" data-open-login><span class="locked-badge">${icon}</span><span><strong>${escapeHtml(title)}</strong><br><small>${escapeHtml(subtitle)}</small></span><span>🔒</span></button>`;
}
function bindProfileEvents() {
  document
    .querySelectorAll("[data-open-login], #loginOpenBtn")
    .forEach((el) => (el.onclick = openLogin));
  const openSettings = () => openSettingsDialog();
  const settingsInMenu = $("openSettingsBtn");
  if (settingsInMenu) settingsInMenu.onclick = openSettings;
  const logout = $("logoutBtn");
  if (logout)
    logout.onclick = () => {
      saveUser(null);
      showToast("Sesión cerrada.");
    };
  const sync = $("syncBtn");
  if (sync)
    sync.onclick = async () => {
      sync.disabled = true;
      try {
        const cloudItems = await loadQuinielasByEmail(user.email);
        const merged = mergeCloudQuinielas(
          getSavedQuinielas(),
          cloudItems,
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        renderProfile();
        showToast(
          cloudItems.length
            ? `${cloudItems.length} quiniela(s) cargada(s).`
            : "No se encontraron quinielas en Cloud.",
        );
      } catch (error) {
        showToast(error.message || "No se pudo consultar Firestore.");
      } finally {
        if (sync.isConnected) sync.disabled = false;
      }
    };
}
function openLogin() {
  $("loginName").value = user?.name || "";
  $("loginEmail").value = user?.email || "";
  $("loginCode").value = user?.accessCode || "";
  $("loginError").textContent = "";
  $("loginDialog").showModal();
}
function openSettingsDialog() {
  if (!user) return openLogin();
  $("settingsCode").value = user.accessCode || "";
  $("settingsDialog").showModal();
}
function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("loginName").value.trim();
  const email = $("loginEmail").value.trim();
  const accessCode = $("loginCode").value.trim();
  const result = await validateCode(accessCode);
  if (!result.ok) {
    $("loginError").textContent = result.message;
    $("loginCode").select();
    return;
  }
  saveUser({
    name,
    email,
    accessCode,
    rankTitle: result.title,
    bestScore: user?.bestScore || 0,
  });
  $("loginDialog").close();
  showToast(
    result.offline
      ? "Sesión iniciada. El código se validará al recuperar conexión."
      : "Sesión iniciada.",
  );
});
$("cancelLoginBtn").onclick = () => $("loginDialog").close();
$("settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const accessCode = $("settingsCode").value.trim();
  const result = await validateCode(accessCode);
  if (!result.ok) return showToast(result.message);
  saveUser({ ...user, accessCode, rankTitle: result.title });
  $("settingsDialog").close();
  showToast("Configuración guardada.");
});
$("closeSettingsBtn").onclick = () => $("settingsDialog").close();
settingsBtn.onclick = openSettingsDialog;
renderProfile();
