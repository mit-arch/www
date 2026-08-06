const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const SRC_DIR = path.join(__dirname, "..");
const PEOPLE_DIR = path.join(__dirname, "people");
const PORTRAIT_DIR = path.join(SRC_DIR, "assets", "images", "people");
const PORTRAIT_URL = "/assets/images/people";
const PLACEHOLDER_URL = "/assets/images/placeholder-portrait.svg";

const SECTIONS = ["faculty", "students", "affiliates", "alumni"];

// Alumni render as a text list, so a missing portrait there is not worth reporting.
const PORTRAIT_SECTIONS = ["faculty", "students", "affiliates"];

// Most preferred first: if someone ships both a .webp and a .jpg, the .webp wins.
const PORTRAIT_EXTENSIONS = [".webp", ".avif", ".jpg", ".jpeg", ".png", ".svg"];

function readYamlArray(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return yaml.load(fs.readFileSync(filePath, "utf8")) || [];
}

function sortAlumni(items) {
  return items.slice().sort((left, right) => {
    return Number(right.graduation_year || 0) - Number(left.graduation_year || 0);
  });
}

// "Daniël Trujillo" and "Daniel_Trujillo" both reduce to "daniel-trujillo", so a
// portrait matches its person regardless of accents, case, or separator style.
function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Index the portrait directory once per build: slug -> filename.
function readPortraits() {
  let entries;

  try {
    entries = fs.readdirSync(PORTRAIT_DIR);
  } catch {
    return new Map();
  }

  return entries.reduce((index, entry) => {
    const extension = path.extname(entry).toLowerCase();
    const rank = PORTRAIT_EXTENSIONS.indexOf(extension);

    if (rank === -1) {
      return index;
    }

    const slug = slugify(path.basename(entry, path.extname(entry)));
    const current = index.get(slug);
    const currentRank = current
      ? PORTRAIT_EXTENSIONS.indexOf(path.extname(current).toLowerCase())
      : Infinity;

    if (rank < currentRank) {
      index.set(slug, entry);
    }

    return index;
  }, new Map());
}

// Portraits are matched by name, so adding one means dropping a file into
// src/assets/images/people/ named after the person. `image:` in the YAML stays
// available as an escape hatch for anything that convention cannot express.
function resolvePortrait(person, portraits, missing) {
  if (person.image) {
    if (fs.existsSync(path.join(SRC_DIR, person.image.replace(/^\//, "")))) {
      return person.image;
    }

    missing.push(`${person.name} (image: ${person.image})`);
    return PLACEHOLDER_URL;
  }

  const file = portraits.get(slugify(person.name));

  if (file) {
    return `${PORTRAIT_URL}/${file}`;
  }

  missing.push(person.name);
  return PLACEHOLDER_URL;
}

function reportMissing(missing, total) {
  if (missing.length === 0) {
    return;
  }

  const shown = missing.slice(0, 8).join(", ");
  const rest = missing.length > 8 ? `, +${missing.length - 8} more` : "";

  console.log(
    `[people] ${missing.length}/${total} without a portrait, using placeholder: ${shown}${rest}`,
  );
}

module.exports = function people() {
  const portraits = readPortraits();
  const missing = [];
  let total = 0;

  const sections = SECTIONS.reduce((accumulator, section) => {
    const items = readYamlArray(path.join(PEOPLE_DIR, `${section}.yaml`));

    if (PORTRAIT_SECTIONS.includes(section)) {
      total += items.length;
      accumulator[section] = items.map((person) => ({
        ...person,
        portrait: resolvePortrait(person, portraits, missing),
      }));
      return accumulator;
    }

    accumulator[section] = section === "alumni" ? sortAlumni(items) : items;
    return accumulator;
  }, {});

  reportMissing(missing, total);

  return sections;
};
