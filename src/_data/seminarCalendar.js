const seminarTerms = require("./seminarTerms");

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeDate(value) {
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return String(value || "");
}

function sortKey(event) {
  return `${normalizeDate(event.date)} ${event.time || ""}`.trim();
}

module.exports = function seminarCalendar() {
  return seminarTerms()
    .flatMap((term) =>
      (term.talks || []).map((talk, index) => ({
        uid: `${term.slug}-${index + 1}-${slugify(talk.speaker)}@mit-arch`,
        termSlug: term.slug,
        termLabel: term.label,
        termTheme: term.theme,
        host: term.host,
        date: talk.date,
        time: talk.time || "",
        location: talk.location || "",
        speaker: talk.speaker || "",
        affiliation: talk.affiliation || "",
        title: talk.title || "",
        abstract: talk.abstract || "",
        format: talk.format || "",
        link: talk.link || ""
      })),
    )
    .sort((a, b) => {
      return sortKey(a).localeCompare(sortKey(b));
    });
};
