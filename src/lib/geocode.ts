/** Postcode → coordinates geocoding via postcodes.io (free, UK-only, no API key). */

export interface GeoResult {
  lat: number;
  lng: number;
}

/**
 * Look up the latitude/longitude for a UK postcode.
 * Returns null if the postcode is empty, invalid, or the lookup fails —
 * callers should treat a null as "no coordinates" rather than an error,
 * so a bad postcode never blocks saving a project.
 */
export async function geocodePostcode(postcode: string): Promise<GeoResult | null> {
  const trimmed = postcode?.trim();
  if (!trimmed) return null;

  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(trimmed)}`
    );
    if (!res.ok) return null;

    const data = await res.json();
    const lat = data?.result?.latitude;
    const lng = data?.result?.longitude;

    if (typeof lat === 'number' && typeof lng === 'number') {
      return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
}
