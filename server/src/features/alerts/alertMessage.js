// The text of a Telegram alert. Plain text only (the sender uses no parse_mode), so a strange title cannot
// change the look of the message. No score: the alert only says "there is a new opening".

// One line: new lines and extra spaces from a scraped page are squeezed.
const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

const day = (date) => date.toISOString().slice(0, 10); // 2026-12-01

// job = { title, company, location, deadline, url }
export function formatOpeningMessage(job) {
  const lines = [`New opening at ${oneLine(job.company)}: ${oneLine(job.title)}`];
  if (oneLine(job.location)) lines.push(`Location: ${oneLine(job.location)}`);
  if (job.deadline instanceof Date && !Number.isNaN(job.deadline.getTime())) lines.push(`Deadline: ${day(job.deadline)}`);
  lines.push(job.url);
  return lines.join('\n');
}

// When more jobs are waiting than one scan may send, one short message covers the rest.
export function formatSummaryMessage(count) {
  const openings = count === 1 ? '1 more new opening' : `${count} more new openings`;
  return `${openings} at your favorite companies. Open JobRadar to see them.`;
}
