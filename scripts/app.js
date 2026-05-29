import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";

import {
  getFirestore,
  doc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyApgnc-co80Na8bX9S_ngpj1HCd_Qn6yMI",
  authDomain: "quiniela-malenka-2026.firebaseapp.com",
  projectId: "quiniela-malenka-2026",
  storageBucket: "quiniela-malenka-2026.firebasestorage.app",
  messagingSenderId: "758271571145",
  appId: "1:758271571145:web:20618c86e5d8af01c34918",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const MATCHES = [
  {
    id: "A1",
    group: "Grupo A",
    date: "2026-06-11",
    homeTeam: "México",
    homeFlag: "🇲🇽",
    awayTeam: "Sudáfrica",
    awayFlag: "🇿🇦",
  },
  {
    id: "A2",
    group: "Grupo A",
    date: "2026-06-12",
    homeTeam: "Corea del Sur",
    homeFlag: "🇰🇷",
    awayTeam: "República Checa",
    awayFlag: "🇨🇿",
  },
  {
    id: "A3",
    group: "Grupo A",
    date: "2026-06-18",
    homeTeam: "República Checa",
    homeFlag: "🇨🇿",
    awayTeam: "Sudáfrica",
    awayFlag: "🇿🇦",
  },
  {
    id: "A4",
    group: "Grupo A",
    date: "2026-06-19",
    homeTeam: "México",
    homeFlag: "🇲🇽",
    awayTeam: "Corea del Sur",
    awayFlag: "🇰🇷",
  },
  {
    id: "A5",
    group: "Grupo A",
    date: "2026-06-24",
    homeTeam: "República Checa",
    homeFlag: "🇨🇿",
    awayTeam: "México",
    awayFlag: "🇲🇽",
  },
  {
    id: "A6",
    group: "Grupo A",
    date: "2026-06-24",
    homeTeam: "Sudáfrica",
    homeFlag: "🇿🇦",
    awayTeam: "Corea del Sur",
    awayFlag: "🇰🇷",
  },
  {
    id: "B1",
    group: "Grupo B",
    date: "2026-06-12",
    homeTeam: "Canadá",
    homeFlag: "🇨🇦",
    awayTeam: "Bosnia y Herzegovina",
    awayFlag: "🇧🇦",
  },
  {
    id: "B2",
    group: "Grupo B",
    date: "2026-06-13",
    homeTeam: "Qatar",
    homeFlag: "🇶🇦",
    awayTeam: "Suiza",
    awayFlag: "🇨🇭",
  },
  {
    id: "B3",
    group: "Grupo B",
    date: "2026-06-18",
    homeTeam: "Suiza",
    homeFlag: "🇨🇭",
    awayTeam: "Bosnia y Herzegovina",
    awayFlag: "🇧🇦",
  },
  {
    id: "B4",
    group: "Grupo B",
    date: "2026-06-18",
    homeTeam: "Canadá",
    homeFlag: "🇨🇦",
    awayTeam: "Qatar",
    awayFlag: "🇶🇦",
  },
  {
    id: "B5",
    group: "Grupo B",
    date: "2026-06-24",
    homeTeam: "Suiza",
    homeFlag: "🇨🇭",
    awayTeam: "Canadá",
    awayFlag: "🇨🇦",
  },
  {
    id: "B6",
    group: "Grupo B",
    date: "2026-06-24",
    homeTeam: "Bosnia y Herzegovina",
    homeFlag: "🇧🇦",
    awayTeam: "Qatar",
    awayFlag: "🇶🇦",
  },
  {
    id: "C1",
    group: "Grupo C",
    date: "2026-06-13",
    homeTeam: "Brasil",
    homeFlag: "🇧🇷",
    awayTeam: "Marruecos",
    awayFlag: "🇲🇦",
  },
  {
    id: "C2",
    group: "Grupo C",
    date: "2026-06-14",
    homeTeam: "Haití",
    homeFlag: "🇭🇹",
    awayTeam: "Escocia",
    awayFlag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  },
  {
    id: "C3",
    group: "Grupo C",
    date: "2026-06-19",
    homeTeam: "Escocia",
    homeFlag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    awayTeam: "Marruecos",
    awayFlag: "🇲🇦",
  },
  {
    id: "C4",
    group: "Grupo C",
    date: "2026-06-19",
    homeTeam: "Brasil",
    homeFlag: "🇧🇷",
    awayTeam: "Haití",
    awayFlag: "🇭🇹",
  },
  {
    id: "C5",
    group: "Grupo C",
    date: "2026-06-24",
    homeTeam: "Escocia",
    homeFlag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    awayTeam: "Brasil",
    awayFlag: "🇧🇷",
  },
  {
    id: "C6",
    group: "Grupo C",
    date: "2026-06-24",
    homeTeam: "Marruecos",
    homeFlag: "🇲🇦",
    awayTeam: "Haití",
    awayFlag: "🇭🇹",
  },
  {
    id: "D1",
    group: "Grupo D",
    date: "2026-06-12",
    homeTeam: "Estados Unidos",
    homeFlag: "🇺🇸",
    awayTeam: "Paraguay",
    awayFlag: "🇵🇾",
  },
  {
    id: "D2",
    group: "Grupo D",
    date: "2026-06-13",
    homeTeam: "Australia",
    homeFlag: "🇦🇺",
    awayTeam: "Turquía",
    awayFlag: "🇹🇷",
  },
  {
    id: "D3",
    group: "Grupo D",
    date: "2026-06-25",
    homeTeam: "Turquía",
    homeFlag: "🇹🇷",
    awayTeam: "Estados Unidos",
    awayFlag: "🇺🇸",
  },
  {
    id: "D4",
    group: "Grupo D",
    date: "2026-06-25",
    homeTeam: "Paraguay",
    homeFlag: "🇵🇾",
    awayTeam: "Australia",
    awayFlag: "🇦🇺",
  },
  {
    id: "D5",
    group: "Grupo D",
    date: "2026-06-19",
    homeTeam: "Estados Unidos",
    homeFlag: "🇺🇸",
    awayTeam: "Australia",
    awayFlag: "🇦🇺",
  },
  {
    id: "D6",
    group: "Grupo D",
    date: "2026-06-20",
    homeTeam: "Turquía",
    homeFlag: "🇹🇷",
    awayTeam: "Paraguay",
    awayFlag: "🇵🇾",
  },
  {
    id: "E1",
    group: "Grupo E",
    date: "2026-06-14",
    homeTeam: "Alemania",
    homeFlag: "🇩🇪",
    awayTeam: "Curazao",
    awayFlag: "🇨🇼",
  },
  {
    id: "E2",
    group: "Grupo E",
    date: "2026-06-14",
    homeTeam: "Costa de Marfil",
    homeFlag: "🇨🇮",
    awayTeam: "Ecuador",
    awayFlag: "🇪🇨",
  },
  {
    id: "E3",
    group: "Grupo E",
    date: "2026-06-20",
    homeTeam: "Alemania",
    homeFlag: "🇩🇪",
    awayTeam: "Costa de Marfil",
    awayFlag: "🇨🇮",
  },
  {
    id: "E4",
    group: "Grupo E",
    date: "2026-06-21",
    homeTeam: "Ecuador",
    homeFlag: "🇪🇨",
    awayTeam: "Curazao",
    awayFlag: "🇨🇼",
  },
  {
    id: "E5",
    group: "Grupo E",
    date: "2026-06-25",
    homeTeam: "Curazao",
    homeFlag: "🇨🇼",
    awayTeam: "Costa de Marfil",
    awayFlag: "🇨🇮",
  },
  {
    id: "E6",
    group: "Grupo E",
    date: "2026-06-25",
    homeTeam: "Ecuador",
    homeFlag: "🇪🇨",
    awayTeam: "Alemania",
    awayFlag: "🇩🇪",
  },
  {
    id: "F1",
    group: "Grupo F",
    date: "2026-06-15",
    homeTeam: "Suecia",
    homeFlag: "🇸🇪",
    awayTeam: "Túnez",
    awayFlag: "🇹🇳",
  },
  {
    id: "F2",
    group: "Grupo F",
    date: "2026-06-14",
    homeTeam: "Países Bajos",
    homeFlag: "🇳🇱",
    awayTeam: "Japón",
    awayFlag: "🇯🇵",
  },
  {
    id: "F3",
    group: "Grupo F",
    date: "2026-06-20",
    homeTeam: "Países Bajos",
    homeFlag: "🇳🇱",
    awayTeam: "Suecia",
    awayFlag: "🇸🇪",
  },
  {
    id: "F4",
    group: "Grupo F",
    date: "2026-06-21",
    homeTeam: "Túnez",
    homeFlag: "🇹🇳",
    awayTeam: "Japón",
    awayFlag: "🇯🇵",
  },
  {
    id: "F5",
    group: "Grupo F",
    date: "2026-06-25",
    homeTeam: "Japón",
    homeFlag: "🇯🇵",
    awayTeam: "Suecia",
    awayFlag: "🇸🇪",
  },
  {
    id: "F6",
    group: "Grupo F",
    date: "2026-06-25",
    homeTeam: "Túnez",
    homeFlag: "🇹🇳",
    awayTeam: "Países Bajos",
    awayFlag: "🇳🇱",
  },
  {
    id: "G1",
    group: "Grupo G",
    date: "2026-06-15",
    homeTeam: "Bélgica",
    homeFlag: "🇧🇪",
    awayTeam: "Egipto",
    awayFlag: "🇪🇬",
  },
  {
    id: "G2",
    group: "Grupo G",
    date: "2026-06-16",
    homeTeam: "Irán",
    homeFlag: "🇮🇷",
    awayTeam: "Nueva Zelanda",
    awayFlag: "🇳🇿",
  },
  {
    id: "G3",
    group: "Grupo G",
    date: "2026-06-21",
    homeTeam: "Bélgica",
    homeFlag: "🇧🇪",
    awayTeam: "Irán",
    awayFlag: "🇮🇷",
  },
  {
    id: "G4",
    group: "Grupo G",
    date: "2026-06-22",
    homeTeam: "Nueva Zelanda",
    homeFlag: "🇳🇿",
    awayTeam: "Egipto",
    awayFlag: "🇪🇬",
  },
  {
    id: "G5",
    group: "Grupo G",
    date: "2026-06-26",
    homeTeam: "Egipto",
    homeFlag: "🇪🇬",
    awayTeam: "Irán",
    awayFlag: "🇮🇷",
  },
  {
    id: "G6",
    group: "Grupo G",
    date: "2026-06-26",
    homeTeam: "Nueva Zelanda",
    homeFlag: "🇳🇿",
    awayTeam: "Bélgica",
    awayFlag: "🇧🇪",
  },
  {
    id: "H1",
    group: "Grupo H",
    date: "2026-06-15",
    homeTeam: "España",
    homeFlag: "🇪🇸",
    awayTeam: "Cabo Verde",
    awayFlag: "🇨🇻",
  },
  {
    id: "H2",
    group: "Grupo H",
    date: "2026-06-15",
    homeTeam: "Arabia Saudita",
    homeFlag: "🇸🇦",
    awayTeam: "Uruguay",
    awayFlag: "🇺🇾",
  },
  {
    id: "H3",
    group: "Grupo H",
    date: "2026-06-21",
    homeTeam: "Uruguay",
    homeFlag: "🇺🇾",
    awayTeam: "Cabo Verde",
    awayFlag: "🇨🇻",
  },
  {
    id: "H4",
    group: "Grupo H",
    date: "2026-06-21",
    homeTeam: "España",
    homeFlag: "🇪🇸",
    awayTeam: "Arabia Saudita",
    awayFlag: "🇸🇦",
  },
  {
    id: "H5",
    group: "Grupo H",
    date: "2026-06-26",
    homeTeam: "Cabo Verde",
    homeFlag: "🇨🇻",
    awayTeam: "Arabia Saudita",
    awayFlag: "🇸🇦",
  },
  {
    id: "H6",
    group: "Grupo H",
    date: "2026-06-26",
    homeTeam: "Uruguay",
    homeFlag: "🇺🇾",
    awayTeam: "España",
    awayFlag: "🇪🇸",
  },
  {
    id: "I1",
    group: "Grupo I",
    date: "2026-06-16",
    homeTeam: "Francia",
    homeFlag: "🇫🇷",
    awayTeam: "Senegal",
    awayFlag: "🇸🇳",
  },
  {
    id: "I2",
    group: "Grupo I",
    date: "2026-06-16",
    homeTeam: "Irak",
    homeFlag: "🇮🇶",
    awayTeam: "Noruega",
    awayFlag: "🇳🇴",
  },
  {
    id: "I3",
    group: "Grupo I",
    date: "2026-06-22",
    homeTeam: "Noruega",
    homeFlag: "🇳🇴",
    awayTeam: "Senegal",
    awayFlag: "🇸🇳",
  },
  {
    id: "I4",
    group: "Grupo I",
    date: "2026-06-22",
    homeTeam: "Francia",
    homeFlag: "🇫🇷",
    awayTeam: "Irak",
    awayFlag: "🇮🇶",
  },
  {
    id: "I5",
    group: "Grupo I",
    date: "2026-06-26",
    homeTeam: "Noruega",
    homeFlag: "🇳🇴",
    awayTeam: "Francia",
    awayFlag: "🇫🇷",
  },
  {
    id: "I6",
    group: "Grupo I",
    date: "2026-06-26",
    homeTeam: "Senegal",
    homeFlag: "🇸🇳",
    awayTeam: "Irak",
    awayFlag: "🇮🇶",
  },
  {
    id: "J1",
    group: "Grupo J",
    date: "2026-06-16",
    homeTeam: "Argentina",
    homeFlag: "🇦🇷",
    awayTeam: "Argelia",
    awayFlag: "🇩🇿",
  },
  {
    id: "J2",
    group: "Grupo J",
    date: "2026-06-16",
    homeTeam: "Austria",
    homeFlag: "🇦🇹",
    awayTeam: "Jordania",
    awayFlag: "🇯🇴",
  },
  {
    id: "J3",
    group: "Grupo J",
    date: "2026-06-22",
    homeTeam: "Argentina",
    homeFlag: "🇦🇷",
    awayTeam: "Austria",
    awayFlag: "🇦🇹",
  },
  {
    id: "J4",
    group: "Grupo J",
    date: "2026-06-22",
    homeTeam: "Jordania",
    homeFlag: "🇯🇴",
    awayTeam: "Argelia",
    awayFlag: "🇩🇿",
  },
  {
    id: "J5",
    group: "Grupo J",
    date: "2026-06-28",
    homeTeam: "Jordania",
    homeFlag: "🇯🇴",
    awayTeam: "Argentina",
    awayFlag: "🇦🇷",
  },
  {
    id: "J6",
    group: "Grupo J",
    date: "2026-06-28",
    homeTeam: "Argelia",
    homeFlag: "🇩🇿",
    awayTeam: "Austria",
    awayFlag: "🇦🇹",
  },
  {
    id: "K1",
    group: "Grupo K",
    date: "2026-06-17",
    homeTeam: "Portugal",
    homeFlag: "🇵🇹",
    awayTeam: "Congo DR",
    awayFlag: "🇨🇩",
  },
  {
    id: "K2",
    group: "Grupo K",
    date: "2026-06-18",
    homeTeam: "Uzbekistán",
    homeFlag: "🇺🇿",
    awayTeam: "Colombia",
    awayFlag: "🇨🇴",
  },
  {
    id: "K3",
    group: "Grupo K",
    date: "2026-06-23",
    homeTeam: "Colombia",
    homeFlag: "🇨🇴",
    awayTeam: "Congo DR",
    awayFlag: "🇨🇩",
  },
  {
    id: "K4",
    group: "Grupo K",
    date: "2026-06-23",
    homeTeam: "Portugal",
    homeFlag: "🇵🇹",
    awayTeam: "Uzbekistán",
    awayFlag: "🇺🇿",
  },
  {
    id: "K5",
    group: "Grupo K",
    date: "2026-06-28",
    homeTeam: "Colombia",
    homeFlag: "🇨🇴",
    awayTeam: "Portugal",
    awayFlag: "🇵🇹",
  },
  {
    id: "K6",
    group: "Grupo K",
    date: "2026-06-28",
    homeTeam: "Congo DR",
    homeFlag: "🇨🇩",
    awayTeam: "Uzbekistán",
    awayFlag: "🇺🇿",
  },
  {
    id: "L1",
    group: "Grupo L",
    date: "2026-06-17",
    homeTeam: "Inglaterra",
    homeFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    awayTeam: "Croacia",
    awayFlag: "🇭🇷",
  },
  {
    id: "L2",
    group: "Grupo L",
    date: "2026-06-18",
    homeTeam: "Ghana",
    homeFlag: "🇬🇭",
    awayTeam: "Panamá",
    awayFlag: "🇵🇦",
  },
  {
    id: "L3",
    group: "Grupo L",
    date: "2026-06-23",
    homeTeam: "Inglaterra",
    homeFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
    awayTeam: "Ghana",
    awayFlag: "🇬🇭",
  },
  {
    id: "L4",
    group: "Grupo L",
    date: "2026-06-24",
    homeTeam: "Panamá",
    homeFlag: "🇵🇦",
    awayTeam: "Croacia",
    awayFlag: "🇭🇷",
  },
  {
    id: "L5",
    group: "Grupo L",
    date: "2026-06-27",
    homeTeam: "Panamá",
    homeFlag: "🇵🇦",
    awayTeam: "Inglaterra",
    awayFlag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  },
  {
    id: "L6",
    group: "Grupo L",
    date: "2026-06-27",
    homeTeam: "Croacia",
    homeFlag: "🇭🇷",
    awayTeam: "Ghana",
    awayFlag: "🇬🇭",
  },
];

const STORAGE_KEY = "quinielaMalenka.saved";
const OFFICIAL_KEY = "quinielaMalenka.sent";
let state = {
  owner: "",
  name: "",
  email: "",
  results: {},
  winners: {},
  sent: false,
  showErrors: false,
};
let confirmAction = null;

const $ = (id) => document.getElementById(id);
const groupsContainer = $("groupsContainer");
const ownerInput = $("ownerInput");
const nameInput = $("nameInput");
const emailInput = $("emailInput");

function groupBy(list, key) {
  return list.reduce((acc, item) => {
    (acc[item[key]] ||= []).push(item);
    return acc;
  }, {});
}
const GROUPS = groupBy(MATCHES, "group");
const GROUP_NAMES = Object.keys(GROUPS);

function formatDate(date) {
  const [year, month, day] = date.split("-");
  const months = { "06": "Junio", "07": "Julio" };
  return `${Number(day)} de ${months[month] || month}`;
}
function getTeams(matches) {
  const map = new Map();
  matches.forEach((m) => {
    map.set(m.homeTeam, m.homeFlag);
    map.set(m.awayTeam, m.awayFlag);
  });
  return [...map.entries()].map(([team, flag]) => ({ team, flag }));
}
function saveAllSaved(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}
function getAllSaved() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}
function makeKey(data = state) {
  return `${data.owner.trim().toLowerCase()}__${data.name.trim().toLowerCase()}`;
}
function syncInputs() {
  state.owner = ownerInput.value.trim();
  state.name = nameInput.value.trim();
  state.email = emailInput.value.trim();
  state.sent = false;
  updateSendButton();
}
function setInputsFromState() {
  ownerInput.value = state.owner || "";
  nameInput.value = state.name || "";
  emailInput.value = state.email || "";
}
function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}
function isEmailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isComplete() {
  const matchesComplete = MATCHES.every(
    (m) =>
      state.results[m.id]?.homeScore !== "" &&
      state.results[m.id]?.awayScore !== "",
  );
  const winnersComplete = GROUP_NAMES.every((g) => !!state.winners[g]);
  return {
    matchesComplete,
    winnersComplete,
    emailComplete: isEmailValid(state.email),
  };
}
function render() {
  groupsContainer.innerHTML = GROUP_NAMES.map((groupName) =>
    renderGroup(groupName, GROUPS[groupName]),
  ).join("");
  bindDynamicEvents();
  updateSendButton();
}
function renderGroup(groupName, matches) {
  const teams = getTeams(matches);
  const hasError =
    state.showErrors &&
    (!state.winners[groupName] ||
      matches.some(
        (m) =>
          !state.results[m.id]?.homeScore || !state.results[m.id]?.awayScore,
      ));
  const winnerOptions = [`<option value="">Seleccionar ganador</option>`]
    .concat(
      teams.map(
        (t) =>
          `<option value="${escapeHtml(t.team)}" ${state.winners[groupName] === t.team ? "selected" : ""}>${t.flag} ${escapeHtml(t.team)}</option>`,
      ),
    )
    .join("");
  return `<article class="group-card" data-group="${escapeHtml(groupName)}">
    <button class="group-header ${hasError ? "error" : ""}" type="button"><span>${escapeHtml(groupName)}</span><span class="chevron">⌄</span></button>
    <div class="group-content">
      <div class="winner-card ${state.showErrors && !state.winners[groupName] ? "error" : ""}">
        <p>¿Quién quedará en 1er Lugar del ${escapeHtml(groupName)}?</p>
        <select data-winner="${escapeHtml(groupName)}">${winnerOptions}</select>
      </div>
      ${matches.map(renderMatch).join("")}
    </div>
  </article>`;
}
function renderMatch(match) {
  const result = state.results[match.id] || { homeScore: "", awayScore: "" };
  const invalid =
    state.showErrors && (result.homeScore === "" || result.awayScore === "");
  return `<div class="match-card ${invalid ? "error" : ""}">
    <div class="match-date">${formatDate(match.date)}</div>
    <div class="match-row">
      <div class="team"><span class="flag">${match.homeFlag}</span><span class="team-name">${escapeHtml(match.homeTeam)}</span></div>
      <div class="score">
        <input inputmode="numeric" pattern="[0-9]*" maxlength="2" data-score="home" data-match="${match.id}" value="${escapeHtml(result.homeScore || "")}" />
        <span>-</span>
        <input inputmode="numeric" pattern="[0-9]*" maxlength="2" data-score="away" data-match="${match.id}" value="${escapeHtml(result.awayScore || "")}" />
      </div>
      <div class="team away"><span class="team-name">${escapeHtml(match.awayTeam)}</span><span class="flag">${match.awayFlag}</span></div>
    </div>
  </div>`;
}
function bindDynamicEvents() {
  document
    .querySelectorAll(".group-header")
    .forEach(
      (btn) =>
        (btn.onclick = () =>
          btn.closest(".group-card").classList.toggle("collapsed")),
    );
  document.querySelectorAll("[data-score]").forEach(
    (input) =>
      (input.oninput = () => {
        input.value = input.value.replace(/\D/g, "").slice(0, 2);
        const id = input.dataset.match;
        state.results[id] ||= { homeScore: "", awayScore: "" };
        state.results[id][
          input.dataset.score === "home" ? "homeScore" : "awayScore"
        ] = input.value;
        state.sent = false;
        updateSendButton();
      }),
  );
  document.querySelectorAll("[data-winner]").forEach(
    (select) =>
      (select.onchange = () => {
        state.winners[select.dataset.winner] = select.value;
        state.sent = false;
        updateSendButton();
      }),
  );
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
function saveQuiniela(force = false) {
  syncInputs();
  const hasData =
    state.owner ||
    state.name ||
    state.email ||
    Object.keys(state.results).length ||
    Object.keys(state.winners).length;
  if (!hasData) return showToast("No hay datos para guardar.");
  if (!state.name || !state.owner)
    return showToast("Agrega nombre y propietario para guardar.");
  const items = getAllSaved();
  const key = makeKey();
  const existingIndex = items.findIndex(
    (i) =>
      i.owner?.trim().toLowerCase() === state.owner.trim().toLowerCase() &&
      i.name?.trim().toLowerCase() === state.name.trim().toLowerCase(),
  );
  if (existingIndex >= 0 && !force)
    return openConfirm(
      "Quiniela existente",
      "Ya existe una quiniela con el mismo nombre y propietario. ¿Deseas sobreescribirla?",
      () => saveQuiniela(true),
    );
  const record = { key, ...state, updatedAt: new Date().toISOString() };
  if (existingIndex >= 0) items[existingIndex] = record;
  else items.unshift(record);
  saveAllSaved(items);
  showToast("¡Quiniela guardada!");
}
function openLoadDialog() {
  const list = $("savedList");
  const items = getAllSaved();
  list.innerHTML = items.length
    ? items
        .map(
          (q, i) =>
            `<div class="saved-item"><div><strong>${escapeHtml(q.name || "(Sin nombre)")}</strong><small>${escapeHtml(q.owner || "Anónimo")} · ${new Date(q.updatedAt).toLocaleString("es-MX")}</small></div><div class="saved-actions"><button class="secondary-button" data-load="${i}">Cargar</button><button class="primary-button" data-delete="${i}">Borrar</button></div></div>`,
        )
        .join("")
    : "<p>No hay quinielas guardadas.</p>";
  $("loadDialog").showModal();
  list.querySelectorAll("[data-load]").forEach(
    (b) =>
      (b.onclick = () => {
        const q = getAllSaved()[Number(b.dataset.load)];
        state = { ...q, showErrors: false, sent: false };
        setInputsFromState();
        render();
        $("loadDialog").close();
        showToast("Quiniela cargada.");
      }),
  );
  list.querySelectorAll("[data-delete]").forEach(
    (b) =>
      (b.onclick = () =>
        openConfirm(
          "¿Eliminar quiniela?",
          "Esta acción no se puede deshacer.",
          () => {
            const all = getAllSaved();
            all.splice(Number(b.dataset.delete), 1);
            saveAllSaved(all);
            openLoadDialog();
            showToast("Quiniela eliminada.");
          },
        )),
  );
}
function clearAll() {
  openConfirm(
    "¿Borrar todo?",
    "Se eliminarán todos los marcadores, ganadores de grupo, nombre, propietario y correo.",
    () => {
      state = {
        owner: "",
        name: "",
        email: "",
        results: {},
        winners: {},
        sent: false,
        showErrors: false,
      };
      setInputsFromState();
      render();
      showToast("Contenido borrado.");
    },
  );
}

async function sendQuiniela() {
  syncInputs();

  const c = isComplete();

  if (!(c.matchesComplete && c.winnersComplete && c.emailComplete)) {
    state.showErrors = true;
    render();

    return showToast(
      !c.emailComplete
        ? "Por favor ingresa un correo electrónico válido."
        : !c.matchesComplete && !c.winnersComplete
          ? "Llena todos los marcadores y elige los ganadores de grupo."
          : !c.matchesComplete
            ? "Por favor llena todos los marcadores."
            : "Por favor elige el ganador de cada grupo.",
    );
  }

  openConfirm(
    "Confirmar envío",
    "¿Estás seguro de que deseas enviar tu quiniela oficial?",
    async () => {
      state.sent = true;

      // ===== GUARDADO LOCAL =====
      localStorage.setItem(
        OFFICIAL_KEY,
        JSON.stringify({
          ...state,
          sentAt: new Date().toISOString(),
        }),
      );

      saveQuiniela(true);

      // ===== FIREBASE =====

      const documentId = `${state.email}_${state.name}_${state.owner}`
        .toLowerCase()
        .trim()
        .replaceAll(" ", "_")
        .replaceAll(".", "_")
        .replaceAll("@", "_");

      const quinielaData = {
        quinielaName: state.name,
        propietarioName: state.owner,
        userEmail: state.email,
        results: state.results,
        groupWinners: state.winners,
        updatedAt: Date.now(),
        status: "received",
        emailStatus: "pending",
        paymentReceived: false,
      };

      try {
        await setDoc(doc(db, "quinielas", documentId), quinielaData);

        await fetch("https://n8n.beetikmx.com/webhook/quiniela-recibida", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            documentId,
            ...quinielaData,
          }),
        });

        updateSendButton();

        showToast("¡Quiniela enviada correctamente!");
      } catch (error) {
        console.error(error);

        showToast("Error al enviar a Firebase");
      }
    },
  );
}

function updateSendButton() {
  const btn = $("sendBtn");
  btn.textContent = state.sent ? "Enviada ✓" : "Enviar";
  btn.disabled = state.sent;
}
function openConfirm(title, message, action) {
  confirmAction = action;
  $("confirmTitle").textContent = title;
  $("confirmMessage").textContent = message;
  $("confirmDialog").showModal();
}

[ownerInput, nameInput, emailInput].forEach((input) =>
  input.addEventListener("input", syncInputs),
);
$("saveBtn").onclick = () => saveQuiniela(false);
$("sendBtn").onclick = sendQuiniela;
$("loadBtn").onclick = openLoadDialog;
$("clearBtn").onclick = clearAll;
$("closeLoadBtn").onclick = () => $("loadDialog").close();
$("cancelConfirmBtn").onclick = () => $("confirmDialog").close();
$("acceptConfirmBtn").onclick = async () => {
  $("confirmDialog").close();
  confirmAction?.();
};
render();
