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

/** A tenant: one business running on the platform. */
export interface Organisation {
  id: string;
  name: string;
  slug?: string;
  brand_color: string;
  logo_url?: string;
  email_from?: string;
  created_at: string;
}

/** Which user belongs to which org, and their role in that org. */
export interface Membership {
  id: string;
  user_id: string;
  org_id: string;
  role: UserRole | 'owner';
  created_at: string;
}

/** A membership joined with its organisation (for switchers/resolution). */
export interface MembershipWithOrg extends Membership {
  org_name: string;
  org_slug?: string;
  brand_color: string;
  logo_url?: string;
}

export type ProjectStatus = 'active' | 'completed' | 'on_hold';

export interface Project {
  id: string;
  org_id?: string;
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
  /** 1 once the day has been vetted & released for the client to see */
  client_released?: number;
  client_released_at?: string;
  /** Per-field client visibility for the entry header (0 = hidden) */
  weather_visible?: number;
  notes_visible?: number;
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
  /** Links to the workforce roster (null for a free-typed temp/agency worker). */
  person_id?: string;
  /** Optional note for this person on this day, e.g. "arrived late due to trains". */
  note?: string;
  client_visible?: number;
  created_at: string;
}

/** A member of a business's workforce roster (people put on site). */
export interface Person {
  id: string;
  org_id: string;
  name: string;
  role: string;          // operative | manager | subcontractor | visitor
  company?: string;
  user_id?: string;
  phone?: string;
  default_days?: string; // CSV of weekday numbers, Mon=1 … Sun=7
  default_start?: string;
  default_end?: string;
  active: number;
  created_at: string;
}

/** A person assigned to a project, optionally overriding their default hours. */
export interface RotaAssignment {
  id: string;
  org_id: string;
  project_id: string;
  person_id: string;
  days?: string;        // CSV weekday numbers (Mon=1 … Sun=7)
  start_time?: string;
  end_time?: string;
  created_at: string;
}

export type AttendanceStatus =
  | 'on_time'    // present and clocked in on time
  | 'late'       // present but clocked in after the expected start (+ grace)
  | 'present'    // present via the manager's register (no clock time to judge)
  | 'absent'     // expected but not present, and the start time has passed
  | 'upcoming'   // expected but the day/start hasn't arrived yet
  | 'left_early' // clocked out before the expected end
  | 'extra';     // present but not on the rota for today

/** One row on the live attendance board: a person expected/present on a site today. */
export interface AttendanceRow {
  person_id: string | null;
  name: string;
  company?: string | null;
  expected_start: string | null;
  expected_end: string | null;
  clocked_in: string | null;
  clocked_out: string | null;
  present: boolean;
  source: 'clock' | 'register' | null;
  hours: number | null;
  note: string | null;
  status: AttendanceStatus;
}

export type ActivityStatus = 'active' | 'complete' | 'on_hold';

export interface EntryActivity {
  id: string;
  entry_id: string;
  task: string;
  description?: string;
  status: ActivityStatus;
  client_visible?: number;
  created_at: string;
}

export interface EntryDelay {
  id: string;
  entry_id: string;
  task: string;
  reason: string;
  hours_lost?: number;
  client_visible?: number;
  created_at: string;
}

export interface EntryVariation {
  id: string;
  entry_id: string;
  description: string;
  hours_required?: number;
  client_visible?: number;
  created_at: string;
}

export interface EntryMaterialRequired {
  id: string;
  entry_id: string;
  supplier: string;
  items: string;
  date_required?: string;
  client_visible?: number;
  created_at: string;
}

export interface EntryEquipmentHire {
  id: string;
  entry_id: string;
  equipment: string;
  supplier: string;
  client_visible?: number;
  created_at: string;
}

export interface EntryDelivery {
  id: string;
  entry_id: string;
  supplier: string;
  notes?: string;
  client_visible?: number;
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
  client_visible?: number;
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
