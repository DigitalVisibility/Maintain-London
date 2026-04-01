import { useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  suppliers: string[];
  label?: string;
}

export default function SupplierSelect({ value, onChange, suppliers, label = 'Supplier' }: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const [customValue, setCustomValue] = useState('');

  function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    if (val === '__custom__') {
      setShowCustom(true);
      setCustomValue('');
    } else {
      setShowCustom(false);
      onChange(val);
    }
  }

  function handleCustomConfirm() {
    if (customValue.trim()) {
      onChange(customValue.trim());
      setShowCustom(false);
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {!showCustom ? (
        <select
          value={value}
          onChange={handleSelect}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
        >
          <option value="">Select supplier...</option>
          {suppliers.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
          <option value="__custom__">+ Add other supplier</option>
        </select>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCustomConfirm()}
            placeholder="Enter supplier name"
            autoFocus
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
          />
          <button
            type="button"
            onClick={handleCustomConfirm}
            className="px-3 py-2 bg-[#AEDE4A] text-gray-900 rounded-md text-sm font-medium hover:bg-[#9BCF3A] transition-colors"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => { setShowCustom(false); onChange(''); }}
            className="px-3 py-2 bg-gray-100 text-gray-600 rounded-md text-sm hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
