import { useState } from 'react';
import ProjectForm from './ProjectForm';

interface Props {
  project: {
    id: string;
    name: string;
    address: string;
    postcode: string;
    client_name: string;
    client_email: string;
    status: string;
  };
}

export default function EditProjectButton({ project }: Props) {
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowForm(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-md text-sm transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
        </svg>
        Edit Project
      </button>

      {showForm && (
        <ProjectForm
          project={project}
          onClose={() => setShowForm(false)}
          onSaved={() => window.location.reload()}
        />
      )}
    </>
  );
}
