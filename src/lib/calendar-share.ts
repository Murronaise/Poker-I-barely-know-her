// Helpers for generating calendar invites and WhatsApp share links for a
// confirmed game. All pure functions — easy to unit-test if we ever do.

export type CalendarEvent = {
  title: string;
  description?: string;
  location?: string;
  /** Local date YYYY-MM-DD */
  date: string;
  /** Local time HH:MM (24h) */
  startTime: string;
  /** Default 4h. Length of the game in minutes. */
  durationMinutes?: number;
};

// ---- ICS (Apple Calendar / Outlook / fallback for everything) -------------

/** Build a `.ics` document body for a single event. */
export function buildIcsBody(event: CalendarEvent): string {
  const start = combineLocalDateTime(event.date, event.startTime);
  const end = new Date(start.getTime() + (event.durationMinutes ?? 240) * 60_000);

  const dtStart = formatIcsLocalDateTime(start);
  const dtEnd = formatIcsLocalDateTime(end);
  const dtStamp = formatIcsUtcDateTime(new Date());
  const uid = `${dtStart}-${slugify(event.title)}@pokertracker`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Poker Tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${icsEscape(event.title)}`,
    event.description ? `DESCRIPTION:${icsEscape(event.description)}` : null,
    event.location ? `LOCATION:${icsEscape(event.location)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n");
}

/** Trigger a `.ics` download in the browser. */
export function downloadIcs(event: CalendarEvent, filename = "poker-night.ics") {
  const body = buildIcsBody(event);
  const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Google Calendar quick-add link ---------------------------------------
// https://www.google.com/calendar/render?action=TEMPLATE&text=...
// Times in this format are interpreted as the user's local timezone, which
// is what we want for a home game.

export function googleCalendarUrl(event: CalendarEvent): string {
  const start = combineLocalDateTime(event.date, event.startTime);
  const end = new Date(start.getTime() + (event.durationMinutes ?? 240) * 60_000);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatIcsLocalDateTime(start)}/${formatIcsLocalDateTime(end)}`,
  });
  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);

  return `https://www.google.com/calendar/render?${params.toString()}`;
}

// ---- WhatsApp share -------------------------------------------------------
// https://wa.me/?text=<encoded>  opens WhatsApp (mobile or web) with the
// message pre-typed; the user picks a chat and hits send.

export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

// ---- Internal --------------------------------------------------------------

function combineLocalDateTime(dateIso: string, time: string): Date {
  const [yyyy, mm, dd] = dateIso.split("-").map(Number);
  const [hh, min] = time.split(":").map(Number);
  return new Date(yyyy, (mm ?? 1) - 1, dd ?? 1, hh ?? 0, min ?? 0, 0, 0);
}

/** YYYYMMDDTHHMMSS — local floating time (no Z), used for both Google and ICS. */
function formatIcsLocalDateTime(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}`;
}

function formatIcsUtcDateTime(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "event";
}
