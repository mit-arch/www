function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function formatTimestamp(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function normalizeDateValue(value) {
  if (value instanceof Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return String(value || "");
}

function formatDateOnly(value) {
  return normalizeDateValue(value).replace(/-/g, "");
}

function formatLocalDateTime(value, timeParts) {
  const normalized = normalizeDateValue(value);
  return `${normalized.replace(/-/g, "")}T${String(timeParts.hours).padStart(2, "0")}${String(timeParts.minutes).padStart(2, "0")}00`;
}

function sortKey(event) {
  return `${normalizeDateValue(event.date)} ${event.time || ""}`.trim();
}

function parseTimeParts(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?$/i);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3] ? match[3].toUpperCase() : "";

  if (meridiem === "PM" && hours < 12) {
    hours += 12;
  }

  if (meridiem === "AM" && hours === 12) {
    hours = 0;
  }

  return { hours, minutes };
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function buildEvent(event, generatedAt) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${generatedAt}`
  ];

  const timeParts = parseTimeParts(event.time);
  if (timeParts) {
    const start = formatLocalDateTime(event.date, timeParts);
    const endParts = parseTimeParts(event.time);
    const endDate = addMinutes(new Date(`2000-01-01T${String(endParts.hours).padStart(2, "0")}:${String(endParts.minutes).padStart(2, "0")}:00`), 60);
    const end = `${formatDateOnly(event.date)}T${String(endDate.getHours()).padStart(2, "0")}${String(endDate.getMinutes()).padStart(2, "0")}00`;
    lines.push(`DTSTART:${start}`);
    lines.push(`DTEND:${end}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${formatDateOnly(event.date)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(`${event.speaker}: ${event.title}`)}`);

  const description = [
    event.affiliation ? `${event.speaker}, ${event.affiliation}` : event.speaker,
    event.termLabel ? `Term: ${event.termLabel}` : "",
    event.termTheme ? `Theme: ${event.termTheme}` : "",
    event.format ? `Format: ${event.format}` : "",
    event.abstract ? `Abstract: ${event.abstract}` : "",
    event.link ? `Link: ${event.link}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  lines.push(`DESCRIPTION:${escapeIcsText(description)}`);

  if (event.location) {
    lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  }

  if (event.link) {
    lines.push(`URL:${escapeIcsText(event.link)}`);
  }

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

module.exports = class SeminarCalendarTemplate {
  data() {
    return {
      permalink: "seminar/all.ics"
    };
  }

  render(data) {
    const generatedAt = formatTimestamp(new Date());
    const events = (data.seminarCalendar || [])
      .slice()
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      .map((event) => buildEvent(event, generatedAt));

    return [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//MIT Architecture Research Group//Seminar Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:MIT Architecture Research Group Seminar",
      "X-WR-CALDESC:All seminar talks across MIT Architecture Research Group terms",
      ...events,
      "END:VCALENDAR",
      ""
    ].join("\r\n");
  }
};
