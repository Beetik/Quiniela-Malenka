import {
  getUserAdminStatus,
  loadAppConfig,
  loadQuinielasByEmail,
  mergeCloudQuinielas,
  updateAppConfig,
  validateAccessCode,
  verifyAdminPassword,
} from "./firebase-service.js";
import { badgeUrlForAchievement, pickShowcaseAchievements } from "./achievements-engine.js";
import { syncUserAchievements } from "./achievements-sync.js";
import { MATCHES } from "./matches-data.js";

const USER_KEY = "quinielaMalenka.user";
const STORAGE_KEY = "quinielaMalenka.saved";
const OFFICIAL_KEY = "quinielaMalenka.sent";

const $ = (id) => document.getElementById(id);
const content = $("profileContent");
const settingsBtn = $("settingsBtn");

let user = getUser();
let currentMatches = MATCHES;

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

async function refreshAdminStatus() {
  if (!user?.email) return;
  try {
    const isAdmin = await getUserAdminStatus(user.email);
    if (Boolean(user.isAdmin) !== isAdmin) {
      user = { ...user, isAdmin };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      renderProfile();
    }
  } catch {
    // Optional admin affordance; keep the profile usable offline.
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

function getOwnedQuinielas() {
  const email = normalizeEmail(user?.email);
  const saved = getSavedQuinielas().filter(
    (quiniela) => normalizeEmail(quiniela.userEmail || quiniela.email) === email,
  );
  const official = getOfficialQuiniela();
  const officialMatches =
    official && normalizeEmail(official.email) === email ? [official] : [];
  return [...saved, ...officialMatches];
}

function getParticipatingQuinielas() {
  return getOwnedQuinielas().filter(
    (quiniela) => Boolean(quiniela.isSent) && Boolean(quiniela.paymentReceived),
  );
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function initialOf(name) {
  return (name || "?").trim().charAt(0).toUpperCase() || "?";
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

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2400);
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

function quinielaResults(quiniela) {
  if (quiniela?.results && typeof quiniela.results === "object") return quiniela.results;
  try {
    return JSON.parse(quiniela?.resultsJson || "{}");
  } catch {
    return {};
  }
}

function quinielaWinners(quiniela) {
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
  ];

  const matchId = String(match?.id || "").trim();
  const firebaseId = String(match?.firebaseId || match?.firebaseDocId || "").trim();

  if (firebaseId) keys.push(firebaseId);

  if (/^A\d+$/i.test(matchId)) {
    const numeric = Number.parseInt(matchId.slice(1), 10);
    if (Number.isFinite(numeric)) keys.push(`M${String(numeric).padStart(2, "0")}`);
  }
  if (/^M\d+$/i.test(matchId)) {
    const numeric = Number.parseInt(matchId.slice(1), 10);
    if (Number.isFinite(numeric)) keys.push(`A${numeric}`);
  }

  if (Number.isFinite(index)) {
    keys.push(`M${String(index + 1).padStart(2, "0")}`);
    keys.push(`A${index + 1}`);
  }

  for (const key of keys) {
    const normalizedKey = String(key || "").trim();
    if (normalizedKey && results[normalizedKey] != null) return results[normalizedKey];
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

function resultKind(home, away) {
  if (home > away) return 1;
  if (home < away) return 2;
  return 0;
}

function calculateRealGroupWinners() {
  const groups = [...new Set(currentMatches.map((match) => match.group))];
  return Object.fromEntries(
    groups.map((group) => {
      const matches = currentMatches.filter((match) => match.group === group);
      if (!matches.every((match) => match.finished)) return [group, null];

      const table = {};
      const goals = {};

      matches.forEach((match) => {
        if (match.realHomeScore == null || match.realAwayScore == null) return;
        const home = Number(match.realHomeScore);
        const away = Number(match.realAwayScore);
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

function calculateQuinielaStats(quiniela) {
  const results = quinielaResults(quiniela);
  const winners = quinielaWinners(quiniela);
  const realWinners = calculateRealGroupWinners();

  let totalPoints = 0;
  let hits = 0;

  currentMatches.forEach((match, index) => {
    if (!match.finished || match.realHomeScore == null || match.realAwayScore == null) return;
    const prediction = getPredictionForMatch(results, match, index);
    const { home, away } = readPredictionScores(prediction);
    if (home == null || away == null) return;

    const realHome = Number(match.realHomeScore);
    const realAway = Number(match.realAwayScore);

    if (home === realHome && away === realAway) {
      totalPoints += 2;
      hits += 1;
    } else if (resultKind(home, away) === resultKind(realHome, realAway)) {
      totalPoints += 1;
      hits += 1;
    }
  });

  Object.entries(realWinners).forEach(([group, realWinner]) => {
    if (realWinner && winners[group] === realWinner) {
      totalPoints += 2;
      hits += 1;
    }
  });

  return { totalPoints, hits };
}

function profileStats() {
  if (!user) return { count: 0, best: 0, position: "-", hits: "-" };

  const ownedQuinielas = getParticipatingQuinielas();
  const uniqueKeys = new Set(
    ownedQuinielas.map(
      (quiniela) =>
        quiniela.cloudId ||
        quiniela.key ||
        `${quiniela.userEmail || quiniela.email}_${quiniela.quinielaName || quiniela.name}_${quiniela.propietarioName || quiniela.owner}`,
    ),
  );

  let bestScore = -1;
  let bestHits = 0;

  ownedQuinielas.forEach((quiniela) => {
    const stats = calculateQuinielaStats(quiniela);
    if (stats.totalPoints > bestScore) {
      bestScore = stats.totalPoints;
      bestHits = stats.hits;
    }
  });

  const position = "-";

  const finishedMatches = currentMatches.filter((match) => match.finished).length;
  const groups = [...new Set(currentMatches.map((match) => match.group))];
  const finishedGroups = groups.filter((group) =>
    currentMatches
      .filter((match) => match.group === group)
      .every((match) => match.finished),
  ).length;
  const totalItems = finishedMatches + finishedGroups;

  return {
    count: uniqueKeys.size,
    best: Math.max(0, bestScore),
    position,
    hits: totalItems > 0 && bestScore >= 0 ? `${bestHits} / ${totalItems}` : "-",
  };
}

function statBox(label, value, footer, valueId = "") {
  return `<article class="stat-box"><span>${escapeHtml(label)}</span><strong${
    valueId ? ` id="${valueId}"` : ""
  }>${escapeHtml(value)}</strong><small>${escapeHtml(footer)}</small></article>`;
}

function lockedItem(icon, title, subtitle) {
  return `<button class="locked-item" type="button" data-open-login><span class="locked-badge">${icon}</span><span><strong>${escapeHtml(title)}</strong><br><small>${escapeHtml(subtitle)}</small></span><span>🔒</span></button>`;
}

function profileAchievement(achievement) {
  const tooltipParts = [achievement.description];
  const bestProgressRaw = Number(achievement.bestProgress);
  const bestProgress = Number.isFinite(bestProgressRaw) ? bestProgressRaw : Number(achievement.progress) || 0;
  const bestSource = achievement.bestQuinielaNames || achievement.bestQuinielaName || "";
  const progressSource =
    achievement.progressQuinielaNames ||
    achievement.progressQuinielaName ||
    achievement.desbloqueadoEnQuiniela ||
    "";
  const unlockedSource =
    achievement.desbloqueadoEnQuiniela ||
    achievement.unlockedQuinielaNames ||
    achievement.unlockedQuinielaName ||
    bestSource ||
    progressSource ||
    achievement.achievedByNames ||
    "Sin identificar";
  const progressFlags = achievement.progressFlags || achievement.bestFlags;
  const bestFlags = achievement.bestFlags || achievement.progressFlags;
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
  const unlockedSourceLabel = unlockedSource;
  const unlockedFlagsLabel = unlockedFlags || unlockedMatch;
  const lockedSource = bestSource || progressSource;
  const lockedFlags = bestFlags || progressFlags;

  if (!achievement.unlocked) {
    tooltipParts.push(`Mejor racha: ${bestProgress} / ${achievement.target}`);
  }
  if (!achievement.unlocked && lockedSource) {
    tooltipParts.push(`Mejor quiniela: ${lockedSource}`);
  }
  if (!achievement.unlocked && lockedFlags) {
    tooltipParts.push(`Equipos de la mejor racha: ${lockedFlags}`);
  }
  if (!achievement.unlocked && progressSource && progressSource !== lockedSource) {
    tooltipParts.push(`Racha actual: ${progressSource}`);
  }
  if (!achievement.unlocked && progressFlags && progressFlags !== lockedFlags) {
    tooltipParts.push(`Último punto: ${progressFlags}`);
  }
  if (achievement.unlocked) {
    tooltipParts.push(`Desbloqueó: ${unlockedSourceLabel}`);
    tooltipParts.push(`Partido: ${unlockedFlagsLabel}`);
  }
  if (achievement.unlocked && achievement.achievedByNames && achievement.achievedByNames !== bestSource) {
    tooltipParts.push(`Cumplido por: ${achievement.achievedByNames}`);
  }

  return `<article class="profile-trophy" title="${escapeHtml(tooltipParts.filter(Boolean).join(" • "))}">
    <div class="profile-trophy-badge">
      <img src="${badgeUrlForAchievement(achievement)}" alt="" loading="lazy" onerror="this.onerror=null;this.src='./images/logros/default.svg';" />
    </div>
    <span class="profile-trophy-name">${escapeHtml(achievement.title)}</span>
  </article>`;
}

function loggedTemplate() {
  const stats = profileStats();
  const title = user.rankTitle || "Sin código";

  return `
    <section class="profile-card">
      <div class="avatar">${escapeHtml(initialOf(user.name))}</div>
      <div>
        <h2 class="profile-name">${escapeHtml(user.name)} 🏅</h2>
        <p class="profile-rank">${escapeHtml(title)}</p>
        <p class="profile-email">${escapeHtml(user.email)}</p>
      </div>
    </section>

    <section class="stats-grid">
      ${statBox("Quinielas", stats.count, "creadas", "profileQuinielaCount")}
      ${statBox("Mejor Puntaje", stats.best, "puntos", "profileBestScore")}
      ${statBox("Posición", stats.position, "en ranking", "profileRankingPosition")}
      ${statBox("Aciertos", stats.hits, "globales", "profileGlobalHits")}
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
      ${
        user.isAdmin
          ? '<button id="adminConfigBtn" class="menu-item admin" type="button"><span>Elegir Quiniela (Admin)</span><span class="menu-icon">⚙</span></button>'
          : ""
      }
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

function refreshProfileStatElements() {
  if (!user) return;
  const stats = profileStats();
  const values = {
    profileQuinielaCount: stats.count,
    profileBestScore: stats.best,
    profileRankingPosition: stats.position,
    profileGlobalHits: stats.hits,
  };
  Object.entries(values).forEach(([id, value]) => {
    const element = $(id);
    if (element) element.textContent = value;
  });
}

function renderProfile() {
  settingsBtn.style.visibility = user ? "visible" : "hidden";
  content.innerHTML = user ? loggedTemplate() : notLoggedTemplate();
  bindProfileEvents();
  if (user) {
    refreshAdminStatus();
    loadProfileAchievements();
  }
}

function openAdminPasswordDialog() {
  $("adminPassword").value = "";
  $("adminPasswordError").textContent = "";
  $("adminPasswordDialog").showModal();
}

async function openAdminConfigDialog() {
  const form = $("adminConfigForm");
  form.classList.add("loading");
  $("adminConfigDialog").showModal();
  try {
    const config = await loadAppConfig();
    $("adminFaseGrupos").checked = config.faseGrupos;
    $("adminFaseFinal").checked = config.faseFinal;
    $("adminVisibleGroups").checked = config.visibleGroups;
    $("adminVisibleFinal").checked = config.visibleFinal;
  } catch (error) {
    showToast(error.message || "No se pudo cargar configuración admin.");
    $("adminConfigDialog").close();
  } finally {
    form.classList.remove("loading");
  }
}

async function updateAdminToggle(patch) {
  try {
    await updateAppConfig(patch);
    showToast("Configuración actualizada.");
  } catch (error) {
    showToast(error.message || "No se pudo guardar configuración.");
  }
}

async function loadProfileAchievements() {
  const achievementsElement = $("profileAchievements");
  const countElement = $("achievementCount");
  if (!achievementsElement || !countElement || !user?.email) return;

  try {
    const { achievements } = await syncUserAchievements({
      userEmail: user.email,
      quinielas: getParticipatingQuinielas(),
      officialParticipants: [],
      matches: currentMatches,
      rankingPosition: null,
      officialCount: 0,
    });

    if (!achievementsElement.isConnected) return;

    const showcase = pickShowcaseAchievements(achievements, 6);
    const unlocked = achievements.filter((item) => item.unlocked);

    countElement.textContent = `${unlocked.length}/${achievements.length}`;
    achievementsElement.classList.remove("achievements-loading");
    achievementsElement.innerHTML = showcase.length
      ? showcase.map(profileAchievement).join("")
      : '<p class="achievements-empty">Aún no has desbloqueado logros.</p>';
  } catch (error) {
    console.error("No fue posible cargar los logros del perfil:", error);
    countElement.textContent = "0/—";
    achievementsElement.classList.remove("achievements-loading");
    achievementsElement.innerHTML = '<p class="achievements-empty">No pudimos cargar tus logros.</p>';
  }
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

function bindProfileEvents() {
  document
    .querySelectorAll("[data-open-login], #loginOpenBtn")
    .forEach((element) => (element.onclick = openLogin));

  const settingsInMenu = $("openSettingsBtn");
  if (settingsInMenu) settingsInMenu.onclick = () => openSettingsDialog();

  const adminConfig = $("adminConfigBtn");
  if (adminConfig) adminConfig.onclick = openAdminPasswordDialog;

  const logout = $("logoutBtn");
  if (logout) {
    logout.onclick = () => {
      saveUser(null);
      showToast("Sesión cerrada.");
    };
  }

  const sync = $("syncBtn");
  if (sync) {
    sync.onclick = async () => {
      sync.disabled = true;
      try {
        const cloudItems = await loadQuinielasByEmail(user.email);
        const merged = mergeCloudQuinielas(getSavedQuinielas(), cloudItems);
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

$("cancelAdminPasswordBtn").onclick = () => $("adminPasswordDialog").close();
$("adminPasswordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("verifyAdminPasswordBtn");
  button.disabled = true;
  $("adminPasswordError").textContent = "";
  try {
    const ok = await verifyAdminPassword(user?.email, $("adminPassword").value);
    if (!ok) {
      $("adminPasswordError").textContent = "Contraseña incorrecta.";
      return;
    }
    $("adminPasswordDialog").close();
    openAdminConfigDialog();
  } catch (error) {
    $("adminPasswordError").textContent = error.message || "No se pudo verificar.";
  } finally {
    button.disabled = false;
  }
});

$("closeAdminConfigBtn").onclick = () => $("adminConfigDialog").close();
$("adminFaseGrupos").onchange = (event) => updateAdminToggle({ faseGrupos: event.target.checked });
$("adminFaseFinal").onchange = (event) => updateAdminToggle({ faseFinal: event.target.checked });
$("adminVisibleGroups").onchange = (event) => {
  const checked = event.target.checked;
  if (checked) $("adminVisibleFinal").checked = false;
  updateAdminToggle({
    visibleGroups: checked,
    visibleFinal: checked ? false : $("adminVisibleFinal").checked,
  });
};
$("adminVisibleFinal").onchange = (event) => {
  const checked = event.target.checked;
  if (checked) $("adminVisibleGroups").checked = false;
  updateAdminToggle({
    visibleFinal: checked,
    visibleGroups: checked ? false : $("adminVisibleGroups").checked,
  });
};

renderProfile();
