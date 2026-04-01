interface DelayItem {
  task: string;
  reason: string;
  hours_lost: number | '';
}

interface Props {
  delays: DelayItem[];
  onChange: (delays: DelayItem[]) => void;
}

export type { DelayItem };

export default function DelayTable({ delays, onChange }: Props) {
  function addDelay() {
    onChange([...delays, { task: '', reason: '', hours_lost: '' }]);
  }

  function updateDelay(index: number, field: keyof DelayItem, value: string | number) {
    const updated = [...delays];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  }

  function removeDelay(index: number) {
    onChange(delays.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-700">Delays</h4>
        <button
          type="button"
          onClick={addDelay}
          className="text-xs font-medium text-[#AEDE4A] hover:text-[#83B81A] transition-colors flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add Delay
        </button>
      </div>

      {delays.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No delays recorded</p>
      ) : (
        <div className="space-y-2">
          {delays.map((delay, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1 space-y-2 sm:space-y-0 sm:flex sm:gap-2">
                <input
                  type="text"
                  value={delay.task}
                  onChange={(e) => updateDelay(index, 'task', e.target.value)}
                  placeholder="Task affected"
                  className="w-full sm:flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
                />
                <input
                  type="text"
                  value={delay.reason}
                  onChange={(e) => updateDelay(index, 'reason', e.target.value)}
                  placeholder="Reason for delay"
                  className="w-full sm:flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
                />
                <input
                  type="number"
                  value={delay.hours_lost}
                  onChange={(e) => updateDelay(index, 'hours_lost', e.target.value ? Number(e.target.value) : '')}
                  placeholder="Hrs lost"
                  min="0"
                  step="0.5"
                  className="w-full sm:w-24 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
                />
              </div>
              <button
                type="button"
                onClick={() => removeDelay(index)}
                className="p-2 text-gray-400 hover:text-red-500 transition-colors mt-0.5"
                title="Remove"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
