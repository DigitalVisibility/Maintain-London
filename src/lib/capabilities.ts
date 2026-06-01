/**
 * Role-based access control for Project Hub.
 *
 * Roles map to a set of capabilities. This is the single source of truth used
 * to gate routes, API endpoints and UI sections — and it's what the future
 * "which roles see which sections" toggles will override on a per-business
 * basis. Keep checks capability-based (can(role, 'edit_diary')) rather than
 * role-based scattered through the code, so the toggles can change behaviour
 * without touching every call site.
 */

export type Role = 'owner' | 'admin' | 'manager' | 'operative' | 'client';

export type Capability =
  | 'manage_users'        // invite/manage staff & clients
  | 'manage_projects'     // create/edit/delete projects
  | 'edit_diary'          // create/edit diary entries
  | 'view_costs'          // see labour/material costs & billing
  | 'approve_works'       // approve additional-works / variation requests
  | 'request_works'       // raise additional-works requests from site
  | 'clock_time'          // clock in/out of projects
  | 'release_to_client'   // vet & release entries to the client
  | 'view_client_portal'  // access the client-facing portal
  | 'message';            // use the per-project message thread

const ALL: Capability[] = [
  'manage_users', 'manage_projects', 'edit_diary', 'view_costs', 'approve_works',
  'request_works', 'clock_time', 'release_to_client', 'view_client_portal', 'message',
];

/** Default capability set per role. */
export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  owner: ALL,
  admin: ALL,
  manager: [
    'manage_projects', 'edit_diary', 'view_costs', 'approve_works',
    'request_works', 'clock_time', 'release_to_client', 'message',
  ],
  operative: ['edit_diary', 'request_works', 'clock_time'],
  // Clients only ever touch their own portal: view released content, approve
  // works that need their sign-off, and message the team.
  client: ['view_client_portal', 'approve_works', 'message'],
};

/** Whether a role is internal staff (anything other than a client). */
export function isStaff(role: string | undefined | null): boolean {
  return !!role && role !== 'client';
}

/** Whether a role has a given capability. Unknown roles get nothing. */
export function can(role: string | undefined | null, capability: Capability): boolean {
  if (!role || !(role in ROLE_CAPABILITIES)) return false;
  return ROLE_CAPABILITIES[role as Role].includes(capability);
}

/** All capabilities for a role (e.g. to pass to the client for UI gating). */
export function capabilitiesFor(role: string | undefined | null): Capability[] {
  if (!role || !(role in ROLE_CAPABILITIES)) return [];
  return ROLE_CAPABILITIES[role as Role];
}

export const ALL_CAPABILITIES = ALL;

/** A per-org override of a role's capability (deviation from the defaults). */
export interface CapabilityOverride { role: string; capability: string; enabled: number; }

/**
 * Effective capabilities for a role = built-in defaults, with the org's
 * overrides applied (enabled=1 adds, enabled=0 removes).
 */
export function effectiveCapabilities(role: string | undefined | null, overrides: CapabilityOverride[] = []): Capability[] {
  const set = new Set<Capability>(capabilitiesFor(role));
  for (const o of overrides) {
    if (o.role !== role) continue;
    if (o.enabled) set.add(o.capability as Capability);
    else set.delete(o.capability as Capability);
  }
  return [...set];
}

/** Capability check against an already-resolved effective list (with fallback to defaults). */
export function hasCap(locals: { capabilities?: string[]; role?: string | null }, capability: Capability): boolean {
  if (locals.capabilities) return locals.capabilities.includes(capability);
  return can(locals.role, capability);
}
