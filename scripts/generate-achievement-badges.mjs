import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const achievements = [
  { title: "Neymar 10", rarity: "Épico" },
  { title: "Maradona 10", rarity: "Legendario" },
  { title: "Ramos 4", rarity: "Raro" },
  { title: "CR7", rarity: "Raro" },
  { title: "Mbappé 10", rarity: "Raro" },
  { title: "R9", rarity: "Épico" },
  { title: "Zidane 5", rarity: "Legendario" },
  { title: "Pelé 10", rarity: "Épico" },
  { title: "Beckham 7", rarity: "Raro" },
  { title: "El Poste", rarity: "Raro" },
  { title: "Jogo Bonito", rarity: "Legendario" },
  { title: "Mala Suerte", rarity: "Común" },
  { title: "Ancelotti", rarity: "Épico" },
  { title: "Tiki-Taka", rarity: "Legendario" },
  { title: "VAR", rarity: "Común" },
  { title: "El Gigante de Concacaf", rarity: "Legendario" },
  { title: "Catenaccio", rarity: "Raro" },
  { title: "FIFA Script", rarity: "Raro" },
  { title: "Mourinho", rarity: "Raro" },
  { title: "Ronaldinho", rarity: "Raro" },
  { title: "La Remontada", rarity: "Épico" },
  { title: "Ave Fénix", rarity: "Épico" },
  { title: "Líder Solitario", rarity: "Raro" },
  { title: "Rey de la Quiniela", rarity: "Mítico" },
  { title: "Caballo Negro", rarity: "Legendario" },
  { title: "Invencible", rarity: "Épico" },
  { title: "Lobo Solitario", rarity: "Legendario" },
  { title: "Visionario", rarity: "Épico" },
  { title: "Pulpo Paul", rarity: "Legendario" },
  { title: "Profeta", rarity: "Épico" },
  { title: "Brujo del Balón", rarity: "Épico" },
  { title: "Oráculo", rarity: "Legendario" },
  { title: "Apuesta Maestra", rarity: "Legendario" },
  { title: "Elegido por los Dioses del Fútbol", rarity: "Mítico" },
  { title: "Bota de Oro", rarity: "Legendario" },
  { title: "Hat-Trick", rarity: "Épico" },
  { title: "Autogol", rarity: "Común" },
  { title: "Francotirador", rarity: "Legendario" },
  { title: "Manitas", rarity: "Raro" },
  { title: "Pichichi", rarity: "Épico" },
  { title: "Gol al 90'", rarity: "Raro" },
  { title: "#NoEraPenal", rarity: "Común" },
  { title: "Anti-Oráculo", rarity: "Raro" },
  { title: "Selección Mexicana en Penales", rarity: "Raro" },
  { title: "Náufrago", rarity: "Común" },
  { title: "Imposible no hay nada", rarity: "Mítico" },
  { title: "GOAT", rarity: "Mítico" },
  { title: "Messi 10", rarity: "Mítico" },
  { title: "Leyenda del Mundial", rarity: "Mítico" },
];

const rarityColors = {
  Común: ["#1d7a4d", "#0d3b25"],
  Raro: ["#1e73be", "#0d2745"],
  Épico: ["#7f46d1", "#2d164f"],
  Legendario: ["#e08a1e", "#5a2f00"],
  Mítico: ["#d4af37", "#5f4700"],
};

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "badge";
}

function initials(title) {
  return String(title || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 4)
    .toUpperCase() || "LOG";
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const root = process.cwd();
const outputDir = path.join(root, "images", "logros");

async function main() {
  await mkdir(outputDir, { recursive: true });

  await writeFile(
    path.join(outputDir, "default.svg"),
    `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="g" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#3d3421"/>
      <stop offset="65%" stop-color="#181d25"/>
      <stop offset="100%" stop-color="#0b0f14"/>
    </radialGradient>
  </defs>
  <circle cx="256" cy="256" r="238" fill="url(#g)" stroke="#ffd700" stroke-width="10"/>
  <circle cx="256" cy="256" r="174" fill="none" stroke="#ffd700" stroke-opacity="0.2" stroke-width="10"/>
  <path d="M256 122l28 68 73 6-56 45 18 71-63-38-63 38 18-71-56-45 73-6z" fill="#ffd700" fill-opacity="0.16"/>
  <text x="256" y="308" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="900" fill="#ffd700">🏆</text>
</svg>`,
    "utf8",
  );

  for (const item of achievements) {
    const [start, end] = rarityColors[item.rarity] || ["#ffd700", "#352700"];
    const fileName = `${slugify(item.title)}.svg`;
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">
  <title>${escapeXml(item.title)}</title>
  <desc>${escapeXml(item.title)}</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${start}"/>
      <stop offset="100%" stop-color="${end}"/>
    </linearGradient>
    <radialGradient id="shine" cx="35%" cy="20%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.34"/>
      <stop offset="70%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="256" cy="256" r="246" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="214" fill="#0d1218" fill-opacity="0.34"/>
  <circle cx="256" cy="256" r="195" fill="none" stroke="#fff6ca" stroke-opacity="0.28" stroke-width="10"/>
  <circle cx="256" cy="256" r="160" fill="url(#shine)"/>
  <path d="M256 104l32 88 92 8-70 58 22 90-76-48-76 48 22-90-70-58 92-8z" fill="#fff6ca" fill-opacity="0.26"/>
  <circle cx="256" cy="256" r="108" fill="#11161d" fill-opacity="0.52" stroke="#fff6ca" stroke-opacity="0.2" stroke-width="8"/>
  <text x="256" y="242" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="900" letter-spacing="2" fill="#fffef4">${escapeXml(initials(item.title))}</text>
  <text x="256" y="292" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" letter-spacing="1.5" fill="#fff7d2" fill-opacity="0.85">${escapeXml(item.rarity.toUpperCase())}</text>
</svg>`;
    await writeFile(path.join(outputDir, fileName), svg, "utf8");
  }

  console.log(`Generated ${achievements.length + 1} badge SVGs in ${outputDir}`);
}

await main();
