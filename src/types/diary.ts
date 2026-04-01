export type UserRole = 'admin' | 'manager' | 'operative';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  image?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatus = 'active' | 'completed' | 'on_hold';

export interface Project {
  id: string;
  name: string;
  address: string;
  postcode: string;
  lat?: number;
  lng?: number;
  client_name?: string;
  client_email?: string;
  status: ProjectStatus;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export type EntryStatus = 'draft' | 'submitted' | 'approved';

export interface DiaryEntry {
  id: string;
  project_id: string;
  created_by: string;
  date: string;
  start_time: string;
  end_time: string;
  site_manager: string;
  weather_temp?: number;
  weather_wind?: number;
  weather_humidity?: number;
  weather_condition?: string;
  weather_icon?: string;
  notes?: string;
  status: EntryStatus;
  created_at: string;
  updated_at: string;
  synced_at?: string;
}

export type PersonnelRole = 'operative' | 'visitor';

export interface EntryPersonnel {
  id: string;
  entry_id: string;
  name: string;
  role: PersonnelRole;
  hours?: number;
  company?: string;
  created_at: string;
}

export type ActivityStatus = 'active' | 'complete' | 'on_hold';

export interface EntryActivity {
  id: string;
  entry_id: string;
  task: string;
  description?: string;
  status: ActivityStatus;
  created_at: string;
}

export interface EntryDelay {
  id: string;
  entry_id: string;
  task: string;
  reason: string;
  hours_lost?: number;
  created_at: string;
}

export interface EntryVariation {
  id: string;
  entry_id: string;
  description: string;
  hours_required?: number;
  created_at: string;
}

export interface EntryMaterialRequired {
  id: string;
  entry_id: string;
  supplier: string;
  items: string;
  date_required?: string;
  created_at: string;
}

export interface EntryEquipmentHire {
  id: string;
  entry_id: string;
  equipment: string;
  supplier: string;
  created_at: string;
}

export interface EntryDelivery {
  id: string;
  entry_id: string;
  supplier: string;
  notes?: string;
  created_at: string;
}

export type FileType = 'photo' | 'delivery_note' | 'variation_doc';

export interface EntryFile {
  id: string;
  entry_id: string;
  r2_key: string;
  filename: string;
  file_type: FileType;
  mime_type: string;
  size_bytes?: number;
  caption?: string;
  linked_to?: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  category?: string;
  is_default: boolean;
  created_at: string;
}

/** Full diary entry with all related data */
export interface DiaryEntryFull extends DiaryEntry {
  personnel: EntryPersonnel[];
  activities: EntryActivity[];
  delays: EntryDelay[];
  variations: EntryVariation[];
  materials_required: EntryMaterialRequired[];
  equipment_hire: EntryEquipmentHire[];
  deliveries: EntryDelivery[];
  files: EntryFile[];
  project?: Project;
}

/** Weather data from OpenWeatherMap */
export interface WeatherData {
  temp: number;
  wind: number;
  humidity: number;
  condition: string;
  icon: string;
}

/** Cloudflare environment bindings */
export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}
