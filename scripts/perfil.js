import {
  loadQuinielasByEmail,
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

    <section>
      <h2 class="section-title">Mis logros</h2>
      <div class="achievements">
        ${achievement("🏆", "Primer envío", hasOfficialForUser() ? "Completado" : "Pendiente")}
        ${achievement("🏆", "10 aciertos", "Completado")}
        ${achievement("🏆", "Participante", "Completado")}
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
function achievement(icon, title, status) {
  return `<article><div class="achievement-icon">${icon}</div><span class="achievement-title">${escapeHtml(title)}</span><span class="achievement-status">${escapeHtml(status)}</span></article>`;
}
function lockedItem(icon, title, subtitle) {
  return `<button class="locked-item" type="button" data-open-login><span class="locked-badge">${icon}</span><span><strong>${escapeHtml(title)}</strong><br><small>${escapeHtml(subtitle)}</small></span><span>🔒</span></button>`;
}
function hasOfficialForUser() {
  const hasSentSaved = getSavedQuinielas().some(
    (item) =>
      item.isSent &&
      user &&
      normalizeEmail(item.userEmail) === normalizeEmail(user.email),
  );
  const official = getOfficialQuiniela();
  return hasSentSaved || !!(
    official &&
    user &&
    normalizeEmail(official.email) === normalizeEmail(user.email)
  );
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
