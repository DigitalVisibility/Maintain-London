import type { APIRoute } from 'astro';
import type { WeatherData } from '../../../types/diary';

export const prerender = false;

/** GET /api/weather?lat=xx&lng=xx — proxy to OpenWeatherMap */
export const GET: APIRoute = async ({ locals, url }) => {
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const lat = url.searchParams.get('lat');
  const lng = url.searchParams.get('lng');

  if (!lat || !lng) {
    return Response.json({ error: 'lat and lng are required' }, { status: 400 });
  }

  // OpenWeatherMap API key should be set in wrangler.toml [vars]
  const apiKey = (locals.runtime.env as any).OPENWEATHER_API_KEY;

  if (!apiKey) {
    // Return mock data if no API key configured (dev mode)
    const mock: WeatherData = {
      temp: 14,
      wind: 8,
      humidity: 65,
      condition: 'Partly cloudy',
      icon: '02d',
    };
    return Response.json(mock);
  }

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`
    );

    if (!res.ok) {
      return Response.json({ error: 'Weather API error' }, { status: 502 });
    }

    const data = await res.json();

    const weather: WeatherData = {
      temp: Math.round(data.main.temp),
      wind: Math.round(data.wind.speed * 2.237), // m/s to mph
      humidity: data.main.humidity,
      condition: data.weather?.[0]?.description ?? 'Unknown',
      icon: data.weather?.[0]?.icon ?? '01d',
    };

    return Response.json(weather);
  } catch {
    return Response.json({ error: 'Failed to fetch weather' }, { status: 502 });
  }
};
