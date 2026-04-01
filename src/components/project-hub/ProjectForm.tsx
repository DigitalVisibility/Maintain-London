import { useState } from 'react';

interface ProjectData {
  id?: string;
  name: string;
  address: string;
  postcode: string;
  client_name: string;
  client_email: string;
  status: string;
}

interface Props {
  project?: ProjectData;
  onClose: () => void;
  onSaved: () => void;
}

export default function ProjectForm({ project, onClose, onSaved }: Props) {
  const isEdit = !!project?.id;

  const [form, setForm] = useState<ProjectData>({
    name: project?.name ?? '',
    address: project?.address ?? '',
    postcode: project?.postcode ?? '',
    client_name: project?.client_name ?? '',
    client_email: project?.client_email ?? '',
    status: project?.status ?? 'active',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(field: keyof ProjectData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.address.trim() || !form.postcode.trim()) {
      setError('Name, address and postcode are required.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const url = isEdit ? `/api/projects/${project!.id}` : '/api/projects';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${isEdit ? 'update' : 'create'} project`);
      }

      onSaved();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Project' : 'New Project'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-sm bg-red-50 border border-red-200 text-red-700 rounded-md">
              {error}
            </div>
          )}

          {/* Project Name */}
          <div>
            <label htmlFor="pf-name" className="block text-sm font-medium text-gray-700 mb-1">
              Project Name *
            </label>
            <input
              id="pf-name"
              type="text"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Kitchen Renovation - 42 Oak Lane"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#AEDE4A] focus:ring-1 focus:ring-[#AEDE4A] outline-none"
            />
          </div>

          {/* Address */}
          <div>
            <label htmlFor="pf-address" className="block text-sm font-medium text-gray-700 mb-1">
              Site Address *
            </label>
            <input
              id="pf-address"
              type="text"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
              placeholder="e.g. 42 Oak Lane, Wandsworth, London"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#AEDE4A] focus:ring-1 focus:ring-[#AEDE4A] outline-none"
            />
          </div>

          {/* Postcode */}
          <div>
            <label htmlFor="pf-postcode" className="block text-sm font-medium text-gray-700 mb-1">
              Postcode *
            </label>
            <input
              id="pf-postcode"
              type="text"
              value={form.postcode}
              onChange={(e) => update('postcode', e.target.value.toUpperCase())}
              placeholder="e.g. SW18 1AA"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#AEDE4A] focus:ring-1 focus:ring-[#AEDE4A] outline-none uppercase"
            />
          </div>

          {/* Client Name */}
          <div>
            <label htmlFor="pf-client" className="block text-sm font-medium text-gray-700 mb-1">
              Client Name
            </label>
            <input
              id="pf-client"
              type="text"
              value={form.client_name}
              onChange={(e) => update('client_name', e.target.value)}
              placeholder="e.g. Mr & Mrs Smith"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#AEDE4A] focus:ring-1 focus:ring-[#AEDE4A] outline-none"
            />
          </div>

          {/* Client Email */}
          <div>
            <label htmlFor="pf-email" className="block text-sm font-medium text-gray-700 mb-1">
              Client Email
            </label>
            <input
              id="pf-email"
              type="email"
              value={form.client_email}
              onChange={(e) => update('client_email', e.target.value)}
              placeholder="e.g. client@email.com"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#AEDE4A] focus:ring-1 focus:ring-[#AEDE4A] outline-none"
            />
          </div>

          {/* Status (only on edit) */}
          {isEdit && (
            <div>
              <label htmlFor="pf-status" className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <select
                id="pf-status"
                value={form.status}
                onChange={(e) => update('status', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#AEDE4A] focus:ring-1 focus:ring-[#AEDE4A] outline-none"
              >
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-gray-900 bg-[#AEDE4A] hover:bg-[#9BCF3A] disabled:opacity-50 rounded-md transition-colors"
            >
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
