const DESKTOP_QUERY = "(min-width: 1024px)";

const TEAM_FLAG_FILES = {
  "Alemania": "de.png",
  "Arabia Saudita": "sa.png",
  "Argelia": "dz.png",
  "Argentina": "ar.png",
  "Australia": "au.png",
  "Austria": "at.png",
  "Belgica": "be.png",
  "Bosnia y Herzegovina": "ba.png",
  "Brasil": "br.png",
  "Cabo Verde": "cv.png",
  "Canada": "ca.png",
  "Colombia": "co.png",
  "Congo DR": "cd.png",
  "Corea del Sur": "kr.png",
  "Costa de Marfil": "ci.png",
  "Croacia": "hr.png",
  "Curazao": "cw.png",
  "Ecuador": "ec.png",
  "Egipto": "eg.png",
  "Escocia": "gb-sct.png",
  "Espana": "es.png",
  "Estados Unidos": "us.png",
  "Francia": "fr.png",
  "Ghana": "gh.png",
  "Haiti": "ht.png",
  "Inglaterra": "gb-eng.png",
  "Irak": "iq.png",
  "Iran": "ir.png",
  "Japon": "jp.png",
  "Jordania": "jo.png",
  "Marruecos": "ma.png",
  "Mexico": "mx.png",
  "Noruega": "no.png",
  "Nueva Zelanda": "nz.png",
  "Paises Bajos": "nl.png",
  "Panama": "pa.png",
  "Paraguay": "py.png",
  "Portugal": "pt.png",
  "Qatar": "qa.png",
  "Republica Checa": "cz.png",
  "Senegal": "sn.png",
  "Sudafrica": "za.png",
  "Suecia": "se.png",
  "Suiza": "ch.png",
  "Tunez": "tn.png",
  "Turquia": "tr.png",
  "Uruguay": "uy.png",
  "Uzbekistan": "uz.png",
};

const TEAM_FLAG_EMOJIS = {
  "Alemania": "🇩🇪",
  "Arabia Saudita": "🇸🇦",
  "Argelia": "🇩🇿",
  "Argentina": "🇦🇷",
  "Australia": "🇦🇺",
  "Austria": "🇦🇹",
  "Belgica": "🇧🇪",
  "Bosnia y Herzegovina": "🇧🇦",
  "Brasil": "🇧🇷",
  "Cabo Verde": "🇨🇻",
  "Canada": "🇨🇦",
  "Colombia": "🇨🇴",
  "Congo DR": "🇨🇩",
  "Corea del Sur": "🇰🇷",
  "Costa de Marfil": "🇨🇮",
  "Croacia": "🇭🇷",
  "Curazao": "🇨🇼",
  "Ecuador": "🇪🇨",
  "Egipto": "🇪🇬",
  "Escocia": "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Espana": "🇪🇸",
  "Estados Unidos": "🇺🇸",
  "Francia": "🇫🇷",
  "Ghana": "🇬🇭",
  "Haiti": "🇭🇹",
  "Inglaterra": "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  "Irak": "🇮🇶",
  "Iran": "🇮🇷",
  "Japon": "🇯🇵",
  "Jordania": "🇯🇴",
  "Marruecos": "🇲🇦",
  "Mexico": "🇲🇽",
  "Noruega": "🇳🇴",
  "Nueva Zelanda": "🇳🇿",
  "Paises Bajos": "🇳🇱",
  "Panama": "🇵🇦",
  "Paraguay": "🇵🇾",
  "Portugal": "🇵🇹",
  "Qatar": "🇶🇦",
  "Republica Checa": "🇨🇿",
  "Senegal": "🇸🇳",
  "Sudafrica": "🇿🇦",
  "Suecia": "🇸🇪",
  "Suiza": "🇨🇭",
  "Tunez": "🇹🇳",
  "Turquia": "🇹🇷",
  "Uruguay": "🇺🇾",
  "Uzbekistan": "🇺🇿",
};

const EMAIL_SAFE_TEAM_FLAG_EMOJIS = {
  "Escocia": "🇬🇧",
  "Inglaterra": "🇬🇧",
};

const desktopMedia = window.matchMedia(DESKTOP_QUERY);
let flagEmojiSupport;

function normalizeTeamName(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeAttribute(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character],
  );
}

function isDesktopFlagsView() {
  return desktopMedia.matches;
}

function canRenderFlagEmoji() {
  if (flagEmojiSupport != null) return flagEmojiSupport;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext?.("2d", { willReadFrequently: true });
  if (!context) {
    flagEmojiSupport = false;
    return flagEmojiSupport;
  }

  canvas.width = 64;
  canvas.height = 64;
  context.font = '42px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  context.textBaseline = "top";
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillText(String.fromCodePoint(0x1f1f2, 0x1f1fd), 4, 6);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let saturatedPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 16) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
    if (spread > 50) saturatedPixels += 1;
  }

  flagEmojiSupport = saturatedPixels > 50;
  return flagEmojiSupport;
}

function flagImagePath(teamName) {
  const file = TEAM_FLAG_FILES[normalizeTeamName(teamName)];
  return file ? `./images/flags/${file}` : "";
}

function teamFlagEmoji(teamName, fallback = "🏳️") {
  const normalizedTeamName = normalizeTeamName(teamName);
  if (!normalizedTeamName || normalizedTeamName === "Por definir") return fallback || "🏳️";
  return TEAM_FLAG_EMOJIS[normalizedTeamName] || fallback || "🏳️";
}

function teamFlagEmailEmoji(teamName, fallback = "🏳️") {
  const normalizedTeamName = normalizeTeamName(teamName);
  if (!normalizedTeamName || normalizedTeamName === "Por definir") return fallback || "🏳️";
  return EMAIL_SAFE_TEAM_FLAG_EMOJIS[normalizedTeamName] || TEAM_FLAG_EMOJIS[normalizedTeamName] || fallback || "🏳️";
}

function teamFlagMarkup(teamName, emoji, className = "flag") {
  const classes = escapeAttribute(`${className} flag-asset`);
  const label = escapeAttribute(`Bandera de ${teamName}`);
  const resolvedEmoji = teamFlagEmoji(teamName, emoji);
  if (isDesktopFlagsView() || !canRenderFlagEmoji()) {
    const src = flagImagePath(teamName);
    if (src) {
      return `<img class="${classes}" src="${escapeAttribute(src)}" alt="${label}" loading="lazy" decoding="async" />`;
    }
  }
  return `<span class="${classes}" role="img" aria-label="${label}">${resolvedEmoji || ""}</span>`;
}

export { canRenderFlagEmoji, flagImagePath, isDesktopFlagsView, teamFlagEmailEmoji, teamFlagEmoji, teamFlagMarkup };
