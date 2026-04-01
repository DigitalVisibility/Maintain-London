import type { ActivityStatus } from '../../types/diary';

interface ActivityItem {
  task: string;
  description: string;
  status: ActivityStatus;
}

interface Props {
  activities: ActivityItem[];
  onChange: (activities: ActivityItem[]) => void;
}

export type { ActivityItem };

const STATUS_OPTIONS: { value: ActivityStatus; label: string; color: string }[] = [
  { value: 'active', label: 'Active', color: 'bg-blue-100 text-blue-700' },
  { value: 'complete', label: 'Complete', color: 'bg-green-100 text-green-700' },
  { value: 'on_hold', label: 'On Hold', color: 'bg-amber-100 text-amber-700' },
];

export default function ActivityTable({ activities, onChange }: Props) {
  function addActivity() {
    onChange([...activities, { task: '', description: '', status: 'active' }]);
  }

  function updateActivity(index: number, field: keyof ActivityItem, value: string) {
    const updated = [...activities];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  }

  function removeActivity(index: number) {
    onChange(activities.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-700">Work Completed</h4>
        <button
          type="button"
          onClick={addActivity}
          className="text-xs font-medium text-[#AEDE4A] hover:text-[#83B81A] transition-colors flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add Task
        </button>
      </div>

      {activities.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No activities recorded</p>
      ) : (
        <div className="space-y-2">
          {activities.map((activity, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1 space-y-2 sm:space-y-0 sm:flex sm:gap-2">
                <input
                  type="text"
                  value={activity.task}
                  onChange={(e) => updateActivity(index, 'task', e.target.value)}
                  placeholder="Task"
                  className="w-full sm:flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
                />
                <input
                  type="text"
                  value={activity.description}
                  onChange={(e) => updateActivity(index, 'description', e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full sm:flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
                />
                <select
                  value={activity.status}
                  onChange={(e) => updateActivity(index, 'status', e.target.value)}
                  className="w-full sm:w-32 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => removeActivity(index)}
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
