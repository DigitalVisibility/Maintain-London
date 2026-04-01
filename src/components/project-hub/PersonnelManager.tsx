import type { EntryPersonnel, PersonnelRole } from '../../types/diary';

interface PersonnelItem {
  name: string;
  role: PersonnelRole;
  hours: number | '';
  company: string;
}

interface Props {
  personnel: PersonnelItem[];
  onChange: (personnel: PersonnelItem[]) => void;
}

export type { PersonnelItem };

export default function PersonnelManager({ personnel, onChange }: Props) {
  function addPerson(role: PersonnelRole) {
    onChange([...personnel, { name: '', role, hours: '', company: '' }]);
  }

  function updatePerson(index: number, field: keyof PersonnelItem, value: string | number) {
    const updated = [...personnel];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  }

  function removePerson(index: number) {
    onChange(personnel.filter((_, i) => i !== index));
  }

  const operatives = personnel.filter((p) => p.role === 'operative');
  const visitors = personnel.filter((p) => p.role === 'visitor');

  return (
    <div className="space-y-4">
      {/* Operatives */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-gray-700">Operatives</h4>
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
        </div>

        {operatives.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No operatives added</p>
        ) : (
          <div className="space-y-2">
            {personnel.map((person, index) =>
              person.role === 'operative' ? (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={person.name}
                    onChange={(e) => updatePerson(index, 'name', e.target.value)}
                    placeholder="Name"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
                  />
                  <input
                    type="number"
                    value={person.hours}
                    onChange={(e) => updatePerson(index, 'hours', e.target.value ? Number(e.target.value) : '')}
                    placeholder="Hrs"
                    min="0"
                    max="24"
                    step="0.5"
                    className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
                  />
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
                    onChange={(e) => updatePerson(index, 'name', e.target.value)}
                    placeholder="Name"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={person.company}
                    onChange={(e) => updatePerson(index, 'company', e.target.value)}
                    placeholder="Company"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
                  />
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
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  );
}
