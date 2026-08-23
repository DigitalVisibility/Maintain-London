import { useEffect, useState } from 'react';
import type { PersonnelRole, Person } from '../../types/diary';
import { generateId } from '../../lib/ids';

interface PersonnelItem {
  /** Stable across saves — see lib/diary-children.ts. */
  id?: string;
  name: string;
  role: PersonnelRole;
  hours: number | '';
  company: string;
  /** Links to the workforce roster (null for a free-typed temp/agency worker). */
  person_id?: string | null;
  /** Optional note for this person today, e.g. "arrived late". */
  note?: string;
  client_visible?: boolean;
}

interface Props {
  personnel: PersonnelItem[];
  onChange: (personnel: PersonnelItem[]) => void;
  /** Operatives can't add/edit who's on site — the manager records that. */
  readOnly?: boolean;
}

export type { PersonnelItem };

/** Hours between two 'HH:MM' times, or '' if either is missing. */
function hoursBetween(start?: string, end?: string): number | '' {
  if (!start || !end) return '';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? Math.round((mins / 60) * 2) / 2 : '';
}

export default function PersonnelManager({ personnel, onChange, readOnly = false }: Props) {
  const [roster, setRoster] = useState<Person[]>([]);

  useEffect(() => {
    if (readOnly) return;
    fetch('/api/people').then((r) => (r.ok ? r.json() : [])).then(setRoster).catch(() => {});
  }, [readOnly]);

  function addPerson(role: PersonnelRole) {
    onChange([...personnel, { id: generateId(), name: '', role, hours: '', company: '', person_id: null, note: '' }]);
  }

  function updatePerson(index: number, patch: Partial<PersonnelItem>) {
    const updated = [...personnel];
    updated[index] = { ...updated[index], ...patch };
    onChange(updated);
  }

  function removePerson(index: number) {
    onChange(personnel.filter((_, i) => i !== index));
  }

  // Typing a name: match the roster (case-insensitive) to link the person and
  // prefill their details; an unmatched name is a valid free-typed temp worker.
  function onNameChange(index: number, name: string) {
    const match = roster.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    const patch: Partial<PersonnelItem> = { name, person_id: match?.id ?? null };
    if (match) {
      if (!personnel[index].company && match.company) patch.company = match.company;
      if (personnel[index].hours === '' ) {
        const h = hoursBetween(match.default_start, match.default_end);
        if (h !== '') patch.hours = h;
      }
    }
    updatePerson(index, patch);
  }

  async function saveToRoster(index: number) {
    const person = personnel[index];
    if (!person.name.trim()) return;
    try {
      const res = await fetch('/api/people', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: person.name.trim(), role: 'operative', company: person.company || undefined }),
      });
      if (!res.ok) return;
      const created = await res.json();
      setRoster((prev) => [...prev, created as Person]);
      updatePerson(index, { person_id: created.id });
    } catch { /* non-blocking */ }
  }

  const operatives = personnel.filter((p) => p.role === 'operative');
  const visitors = personnel.filter((p) => p.role === 'visitor');
  const rosterNames = roster.map((p) => p.name);

  return (
    <div className="space-y-4">
      {/* Shared type-ahead list for names (predictive: "M" → Mike, Marco, …) */}
      <datalist id="roster-people">
        {rosterNames.map((n) => <option key={n} value={n} />)}
      </datalist>

      {/* Operatives */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">Operatives</h4>
          {!readOnly && (
          <button
            type="button"
            onClick={() => addPerson('operative')}
            className="text-xs font-medium text-[#AEDE4A] hover:text-[#83B81A] transition-colors flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Add Operative
          </button>
          )}
        </div>

        {operatives.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No operatives added</p>
        ) : (
          <div className="space-y-3">
            {personnel.map((person, index) =>
              person.role === 'operative' ? (
                <div key={index} className="border border-gray-100 rounded-md p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={person.name}
                      onChange={(e) => onNameChange(index, e.target.value)}
                      placeholder="Name"
                      list="roster-people"
                      disabled={readOnly}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    <input
                      type="number"
                      value={person.hours}
                      onChange={(e) => updatePerson(index, { hours: e.target.value ? Number(e.target.value) : '' })}
                      placeholder="Hrs"
                      min="0"
                      max="24"
                      step="0.5"
                      disabled={readOnly}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                    />
                    {!readOnly && (
                    <button
                      type="button"
                      onClick={() => removePerson(index)}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      title="Remove"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                    )}
                  </div>
                  {!readOnly && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={person.note ?? ''}
                        onChange={(e) => updatePerson(index, { note: e.target.value })}
                        placeholder="Note (optional) — e.g. arrived late due to trains"
                        className="flex-1 px-3 py-1.5 border border-gray-200 rounded-md text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
                      />
                      {person.name.trim() && !person.person_id && (
                        <button
                          type="button"
                          onClick={() => saveToRoster(index)}
                          className="text-xs font-medium text-[#83B81A] hover:underline whitespace-nowrap"
                          title="Add this person to your team so they're suggested next time"
                        >
                          + Save to team
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : null
            )}
          </div>
        )}
      </div>

      {/* Visitors */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">Visitors</h4>
          {!readOnly && (
          <button
            type="button"
            onClick={() => addPerson('visitor')}
            className="text-xs font-medium text-[#AEDE4A] hover:text-[#83B81A] transition-colors flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Add Visitor
          </button>
          )}
        </div>

        {visitors.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No visitors logged</p>
        ) : (
          <div className="space-y-2">
            {personnel.map((person, index) =>
              person.role === 'visitor' ? (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={person.name}
                    onChange={(e) => updatePerson(index, { name: e.target.value })}
                    placeholder="Name"
                    disabled={readOnly}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                  />
                  <input
                    type="text"
                    value={person.company}
                    onChange={(e) => updatePerson(index, { company: e.target.value })}
                    placeholder="Company"
                    disabled={readOnly}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                  />
                  {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removePerson(index)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                  )}
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  );
}
