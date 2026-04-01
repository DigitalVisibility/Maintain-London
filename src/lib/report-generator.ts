/**
 * HTML report generator for diary entries.
 * Builds a branded, printable summary report.
 */

import type { DiaryEntryFull, Project } from '../types/diary';

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function calcDuration(start: string, end: string): string {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ''}`;
}

function weatherEmoji(condition: string): string {
  const map: Record<string, string> = {
    sunny: '☀️', clear: '☀️', cloudy: '☁️', clouds: '☁️',
    rain: '🌧️', drizzle: '🌦️', thunderstorm: '⛈️',
    snow: '❄️', mist: '🌫️', fog: '🌫️',
  };
  return map[condition?.toLowerCase()] || '🌤️';
}

/** Generate HTML for a single diary entry report */
export function generateEntryReportHTML(entry: DiaryEntryFull, project: Project): string {
  const operatives = entry.personnel.filter((p) => p.role === 'operative');
  const visitors = entry.personnel.filter((p) => p.role === 'visitor');
  const totalHours = operatives.reduce((sum, p) => sum + (p.hours || 0), 0);
  const totalDelayHours = entry.delays.reduce((sum, d) => sum + (d.hours_lost || 0), 0);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Site Diary — ${project.name} — ${formatDate(entry.date)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #111827; font-size: 14px; line-height: 1.5; }
  .page { max-width: 800px; margin: 0 auto; padding: 32px; }

  @media print {
    .page { padding: 16px; max-width: 100%; }
    .no-print { display: none !important; }
    table { page-break-inside: avoid; }
  }

  /* Header */
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #AEDE4A; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { font-size: 20px; font-weight: 700; }
  .header .subtitle { color: #6B7280; font-size: 13px; margin-top: 2px; }
  .brand { color: #AEDE4A; font-weight: 700; font-size: 16px; }

  /* Meta grid */
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .meta-item { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 10px 14px; }
  .meta-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #9CA3AF; font-weight: 600; }
  .meta-value { font-size: 15px; font-weight: 600; margin-top: 2px; }

  /* Sections */
  .section { margin-bottom: 20px; }
  .section-title { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #374151; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #E5E7EB; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #F3F4F6; text-align: left; padding: 8px 12px; font-weight: 600; color: #374151; border: 1px solid #E5E7EB; }
  td { padding: 8px 12px; border: 1px solid #E5E7EB; }
  tr:nth-child(even) td { background: #F9FAFB; }

  /* Status badges */
  .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; text-transform: capitalize; }
  .badge-active { background: #DBEAFE; color: #1E40AF; }
  .badge-complete { background: #D1FAE5; color: #065F46; }
  .badge-on_hold { background: #FEF3C7; color: #92400E; }

  /* Weather */
  .weather { display: flex; align-items: center; gap: 12px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; }
  .weather-icon { font-size: 28px; }
  .weather-detail { font-size: 13px; color: #6B7280; }
  .weather-detail strong { color: #111827; }

  /* Notes */
  .notes { background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 14px 16px; white-space: pre-wrap; font-size: 13px; }

  /* Footer */
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E7EB; color: #9CA3AF; font-size: 11px; display: flex; justify-content: space-between; }

  .empty { color: #9CA3AF; font-style: italic; font-size: 13px; padding: 8px 0; }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <h1>${project.name}</h1>
      <div class="subtitle">${project.address}, ${project.postcode}${project.client_name ? ` — Client: ${project.client_name}` : ''}</div>
    </div>
    <div class="brand">Maintain London</div>
  </div>

  <!-- Meta -->
  <div class="meta">
    <div class="meta-item">
      <div class="meta-label">Date</div>
      <div class="meta-value">${formatDate(entry.date)}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Hours</div>
      <div class="meta-value">${entry.start_time} – ${entry.end_time} (${calcDuration(entry.start_time, entry.end_time)})</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Site Manager</div>
      <div class="meta-value">${entry.site_manager}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Status</div>
      <div class="meta-value" style="text-transform:capitalize">${entry.status}</div>
    </div>
  </div>

  <!-- Weather -->
  ${entry.weather_condition ? `
  <div class="weather">
    <div class="weather-icon">${weatherEmoji(entry.weather_condition)}</div>
    <div>
      <div class="weather-detail"><strong>${entry.weather_condition}</strong></div>
      <div class="weather-detail">${entry.weather_temp != null ? `${entry.weather_temp}°C` : ''}${entry.weather_wind != null ? ` · Wind: ${entry.weather_wind} mph` : ''}${entry.weather_humidity != null ? ` · Humidity: ${entry.weather_humidity}%` : ''}</div>
    </div>
  </div>` : ''}

  <!-- Personnel -->
  <div class="section">
    <div class="section-title">Personnel On Site</div>
    ${operatives.length > 0 ? `
    <table>
      <thead><tr><th>Name</th><th>Hours</th></tr></thead>
      <tbody>
        ${operatives.map((p) => `<tr><td>${p.name}</td><td>${p.hours ?? '—'}</td></tr>`).join('')}
        <tr style="font-weight:600"><td>Total</td><td>${totalHours || '—'}</td></tr>
      </tbody>
    </table>` : '<div class="empty">No operatives recorded</div>'}

    ${visitors.length > 0 ? `
    <div style="margin-top:12px">
      <div style="font-size:12px;font-weight:600;color:#6B7280;margin-bottom:4px">Visitors</div>
      <table>
        <thead><tr><th>Name</th><th>Company</th></tr></thead>
        <tbody>${visitors.map((v) => `<tr><td>${v.name}</td><td>${v.company || '—'}</td></tr>`).join('')}</tbody>
      </table>
    </div>` : ''}
  </div>

  <!-- Activities -->
  <div class="section">
    <div class="section-title">Activities / Work Completed</div>
    ${entry.activities.length > 0 ? `
    <table>
      <thead><tr><th>Task</th><th>Description</th><th>Status</th></tr></thead>
      <tbody>${entry.activities.map((a) => `<tr><td>${a.task}</td><td>${a.description || '—'}</td><td><span class="badge badge-${a.status}">${a.status.replace('_', ' ')}</span></td></tr>`).join('')}</tbody>
    </table>` : '<div class="empty">No activities recorded</div>'}
  </div>

  <!-- Delays -->
  ${entry.delays.length > 0 ? `
  <div class="section">
    <div class="section-title">Delays</div>
    <table>
      <thead><tr><th>Task</th><th>Reason</th><th>Hours Lost</th></tr></thead>
      <tbody>
        ${entry.delays.map((d) => `<tr><td>${d.task}</td><td>${d.reason}</td><td>${d.hours_lost ?? '—'}</td></tr>`).join('')}
        ${totalDelayHours > 0 ? `<tr style="font-weight:600"><td colspan="2">Total Hours Lost</td><td>${totalDelayHours}</td></tr>` : ''}
      </tbody>
    </table>
  </div>` : ''}

  <!-- Variations -->
  ${entry.variations.length > 0 ? `
  <div class="section">
    <div class="section-title">Variations</div>
    <table>
      <thead><tr><th>Description</th><th>Hours Required</th></tr></thead>
      <tbody>${entry.variations.map((v) => `<tr><td>${v.description}</td><td>${v.hours_required ?? '—'}</td></tr>`).join('')}</tbody>
    </table>
  </div>` : ''}

  <!-- Materials Required -->
  ${entry.materials_required.length > 0 ? `
  <div class="section">
    <div class="section-title">Materials / Equipment Required</div>
    <table>
      <thead><tr><th>Supplier</th><th>Items</th><th>Date Required</th></tr></thead>
      <tbody>${entry.materials_required.map((m) => `<tr><td>${m.supplier}</td><td>${m.items}</td><td>${m.date_required || '—'}</td></tr>`).join('')}</tbody>
    </table>
  </div>` : ''}

  <!-- Equipment Hire -->
  ${entry.equipment_hire.length > 0 ? `
  <div class="section">
    <div class="section-title">Equipment Hire</div>
    <table>
      <thead><tr><th>Equipment</th><th>Supplier</th></tr></thead>
      <tbody>${entry.equipment_hire.map((e) => `<tr><td>${e.equipment}</td><td>${e.supplier}</td></tr>`).join('')}</tbody>
    </table>
  </div>` : ''}

  <!-- Materials Delivered -->
  ${entry.deliveries.length > 0 ? `
  <div class="section">
    <div class="section-title">Materials Delivered</div>
    <table>
      <thead><tr><th>Supplier</th><th>Notes</th></tr></thead>
      <tbody>${entry.deliveries.map((d) => `<tr><td>${d.supplier}</td><td>${d.notes || '—'}</td></tr>`).join('')}</tbody>
    </table>
  </div>` : ''}

  <!-- Photos -->
  ${entry.files.filter((f) => f.mime_type.startsWith('image/')).length > 0 ? `
  <div class="section">
    <div class="section-title">Photos (${entry.files.filter((f) => f.mime_type.startsWith('image/')).length})</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      ${entry.files.filter((f) => f.mime_type.startsWith('image/')).map((f) => `<div style="aspect-ratio:1;overflow:hidden;border-radius:6px;border:1px solid #E5E7EB"><img src="/api/photos/${encodeURIComponent(f.r2_key)}" style="width:100%;height:100%;object-fit:cover" alt="${f.caption || f.filename}"></div>`).join('')}
    </div>
  </div>` : ''}

  <!-- Notes -->
  ${entry.notes ? `
  <div class="section">
    <div class="section-title">Notes</div>
    <div class="notes">${entry.notes}</div>
  </div>` : ''}

  <!-- Footer -->
  <div class="footer">
    <div>Generated by Maintain London Project Hub</div>
    <div>${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
  </div>

</div>
</body>
</html>`;
}

/** Generate HTML for a weekly summary report (multiple entries) */
export function generateWeeklyReportHTML(entries: DiaryEntryFull[], project: Project, weekOf: string): string {
  const totalOperativeHours = entries.reduce(
    (sum, e) => sum + e.personnel.filter((p) => p.role === 'operative').reduce((s, p) => s + (p.hours || 0), 0),
    0
  );
  const totalDelayHours = entries.reduce(
    (sum, e) => sum + e.delays.reduce((s, d) => s + (d.hours_lost || 0), 0),
    0
  );
  const totalActivities = entries.reduce((sum, e) => sum + e.activities.length, 0);
  const completedActivities = entries.reduce(
    (sum, e) => sum + e.activities.filter((a) => a.status === 'complete').length,
    0
  );
  const totalPhotos = entries.reduce(
    (sum, e) => sum + e.files.filter((f) => f.mime_type.startsWith('image/')).length,
    0
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Weekly Summary — ${project.name} — w/c ${weekOf}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #111827; font-size: 14px; line-height: 1.5; }
  .page { max-width: 800px; margin: 0 auto; padding: 32px; }
  @media print { .page { padding: 16px; max-width: 100%; } .no-print { display: none !important; } }
  .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #AEDE4A; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { font-size: 20px; font-weight: 700; }
  .header .subtitle { color: #6B7280; font-size: 13px; margin-top: 2px; }
  .brand { color: #AEDE4A; font-weight: 700; font-size: 16px; }
  .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
  .stat { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 14px; text-align: center; }
  .stat-value { font-size: 24px; font-weight: 700; color: #111827; }
  .stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #9CA3AF; font-weight: 600; margin-top: 2px; }
  .day { margin-bottom: 20px; border: 1px solid #E5E7EB; border-radius: 8px; overflow: hidden; }
  .day-header { background: #F3F4F6; padding: 10px 16px; font-weight: 700; font-size: 14px; border-bottom: 1px solid #E5E7EB; }
  .day-body { padding: 12px 16px; font-size: 13px; }
  .day-body ul { padding-left: 18px; margin: 4px 0; }
  .day-body li { margin: 2px 0; }
  .day-meta { display: flex; gap: 16px; color: #6B7280; font-size: 12px; margin-bottom: 6px; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E5E7EB; color: #9CA3AF; font-size: 11px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <h1>${project.name} — Weekly Summary</h1>
      <div class="subtitle">${project.address}, ${project.postcode}${project.client_name ? ` — Client: ${project.client_name}` : ''}</div>
      <div class="subtitle">Week commencing ${formatDate(weekOf)}</div>
    </div>
    <div class="brand">Maintain London</div>
  </div>

  <div class="stats">
    <div class="stat"><div class="stat-value">${entries.length}</div><div class="stat-label">Days Logged</div></div>
    <div class="stat"><div class="stat-value">${totalOperativeHours}</div><div class="stat-label">Labour Hours</div></div>
    <div class="stat"><div class="stat-value">${completedActivities}/${totalActivities}</div><div class="stat-label">Tasks Done</div></div>
    <div class="stat"><div class="stat-value">${totalDelayHours}</div><div class="stat-label">Delay Hours</div></div>
    <div class="stat"><div class="stat-value">${totalPhotos}</div><div class="stat-label">Photos</div></div>
  </div>

  ${entries.sort((a, b) => a.date.localeCompare(b.date)).map((e) => {
    const ops = e.personnel.filter((p) => p.role === 'operative');
    const hrs = ops.reduce((s, p) => s + (p.hours || 0), 0);
    return `
  <div class="day">
    <div class="day-header">${formatDate(e.date)}</div>
    <div class="day-body">
      <div class="day-meta">
        <span>${e.start_time} – ${e.end_time} (${calcDuration(e.start_time, e.end_time)})</span>
        <span>${ops.length} operative${ops.length !== 1 ? 's' : ''}, ${hrs}h</span>
        <span>Manager: ${e.site_manager}</span>
      </div>
      ${e.activities.length > 0 ? `<div style="margin-top:6px"><strong>Activities:</strong><ul>${e.activities.map((a) => `<li>${a.task}${a.description ? ` — ${a.description}` : ''} <span style="color:${a.status === 'complete' ? '#059669' : '#6B7280'};font-size:11px">(${a.status})</span></li>`).join('')}</ul></div>` : ''}
      ${e.delays.length > 0 ? `<div style="margin-top:6px;color:#DC2626"><strong>Delays:</strong><ul>${e.delays.map((d) => `<li>${d.task}: ${d.reason}${d.hours_lost ? ` (${d.hours_lost}h lost)` : ''}</li>`).join('')}</ul></div>` : ''}
      ${e.variations.length > 0 ? `<div style="margin-top:6px"><strong>Variations:</strong><ul>${e.variations.map((v) => `<li>${v.description}${v.hours_required ? ` (${v.hours_required}h)` : ''}</li>`).join('')}</ul></div>` : ''}
      ${e.notes ? `<div style="margin-top:6px;color:#6B7280"><strong>Notes:</strong> ${e.notes}</div>` : ''}
    </div>
  </div>`;
  }).join('')}

  <div class="footer">
    <div>Generated by Maintain London Project Hub</div>
    <div>${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
  </div>
</div>
</body>
</html>`;
}
