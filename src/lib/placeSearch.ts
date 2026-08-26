/**
 * Place search via OpenStreetMap Nominatim (free, no API key).
 * Usage policy: max 1 req/sec, include a descriptive User-Agent —
 * we debounce client-side and cache results.
 * https://operations.osmfoundation.org/policies/nominatim/
 */

export interface Place {
  name: string;      // e.g. "Zachary's Pizza"
  address: string;   // e.g. "Main St, Huntingdon, PA"
  lat: number;
  lon: number;
  type: string;      // bar, restaurant, cafe, pub...
}

const NOMINATIM = 'https://nominatim.openstreetmap.org';

export async function searchPlaces(query: string, signal?: AbortSignal, near?: { lat: number; lon: number }): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '8',
    ...(near ? { lat: String(near.lat), lon: String(near.lon) } : {}),
  });

  const res = await fetch(`${NOMINATIM}/search?${params}`, {
    signal,
    headers: { accept: 'application/json' },
  });
  if (!res.ok) return [];

  const items: any[] = await res.json();
  return items.map((it) => {
    const a = it.address ?? {};
    const street = a.road || a.pedestrian || a.neighbourhood || '';
    const city = a.city || a.town || a.village || a.hamlet || a.county || '';
    const state = a.state ? `, ${a.state}` : '';
    const address = [street, `${city}${state}`].filter(Boolean).join(', ');
    return {
      name: it.name || (it.display_name ?? '').split(',')[0] || q,
      address,
      lat: Number(it.lat),
      lon: Number(it.lon),
      type: (it.type ?? it.category ?? 'place') as string,
    };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
}

/** Reverse geocode coords to the nearest bar/restaurant/cafe (or any place). */
export async function findNearbyPlaces(
  lat: number,
  lon: number,
  signal?: AbortSignal,
): Promise<Place[]> {
  const params = new URLSearchParams({
    format: 'jsonv2',
    lat: String(lat),
    lon: String(lon),
    // Ranked by proximity; amenity kinds first
    extratags: '0',
    limit: '1',
  });

  const res = await fetch(`${NOMINATIM}/reverse?${params}`, { signal, headers: { accept: 'application/json' } });
  if (!res.ok) return [];
  const it = await res.json();
  if (!it || it.error) return [];
  const a = it.address ?? {};
  // Prefer a named amenity in the result; fall back to address locality
  const name = it.name || a.bar || a.pub || a.restaurant || a.cafe || a.city || a.town || a.village;
  if (!name) return [];
  const city = a.city || a.town || a.village || a.county || '';
  const state = a.state ? `, ${a.state}` : '';
  return [{
    name: String(name),
    address: [city ? `${city}${state}` : String(it.display_name ?? '').split(',').slice(1, 3).join(',').trim()].filter(Boolean)[0] ?? '',
    lat,
    lon,
    type: (it.type ?? 'place') as string,
  }];
}

export function getGeoPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation not supported on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(new Error(err.message || 'Could not get location')),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

export function placeLabel(p: Place): string {
  return p.address ? `${p.name} — ${p.address}` : p.name;
}
