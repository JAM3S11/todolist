'use client';
// Public holidays from Nager.Date (free, no key): https://date.nager.at
// Only the year and a country code are sent. Each year is kept in this browser, so it still shows offline.
import { useEffect, useState } from 'react';

const API = 'https://date.nager.at/api/v3';
const COUNTRY_KEY = 'holidayCountry';
const memory = new Map(); // 'KE-2026' → holidays

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

// A first guess at the country from the time zone, then the browser language (en-KE → KE)
const ZONES = {
  'Africa/Nairobi': 'KE', 'Africa/Kampala': 'UG', 'Africa/Dar_es_Salaam': 'TZ', 'Africa/Kigali': 'RW', 'Africa/Lagos': 'NG',
  'Africa/Johannesburg': 'ZA', 'Africa/Cairo': 'EG', 'Africa/Accra': 'GH', 'Europe/London': 'GB', 'Europe/Dublin': 'IE',
  'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Asia/Kolkata': 'IN', 'Australia/Sydney': 'AU', 'America/Toronto': 'CA',
};
function guessCountry() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (ZONES[zone]) return ZONES[zone];
  } catch {}
  const region = (navigator.language || '').split('-')[1];
  return region && region.length === 2 ? region.toUpperCase() : 'KE';
}

// The country whose holidays show, remembered in this browser
export function useHolidayCountry() {
  const [country, setCountry] = useState('KE');
  useEffect(() => setCountry(store.get(COUNTRY_KEY) || guessCountry()), []);
  const change = (code) => { setCountry(code); store.set(COUNTRY_KEY, code); };
  return [country, change];
}

// Countries Nager.Date has holidays for: [{ countryCode, name }]
export function useHolidayCountries() {
  const [list, setList] = useState(() => memory.get('countries') || []);
  useEffect(() => {
    if (memory.has('countries')) return;
    const saved = store.get('holidayCountries');
    if (saved) setList(saved);
    fetch(`${API}/AvailableCountries`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((all) => {
        const sorted = all.sort((a, b) => a.name.localeCompare(b.name));
        memory.set('countries', sorted);
        store.set('holidayCountries', sorted);
        setList(sorted);
      })
      .catch(() => {});
  }, []);
  return list;
}

// A year's holidays: { list: [{ date, name, localName }], byDay: Map(date → holiday), status: 'loading' | 'ok' | 'error' }
export function useHolidays(year, country) {
  const id = `${country}-${year}`;
  const [state, setState] = useState({ id: null, list: [], status: 'loading' });

  useEffect(() => {
    if (!country) return;
    const cached = memory.get(id) || store.get(`holidays-${id}`);
    if (cached) {
      memory.set(id, cached);
      setState({ id, list: cached, status: 'ok' });
      return;
    }
    let live = true;
    setState({ id, list: [], status: 'loading' });
    fetch(`${API}/PublicHolidays/${year}/${country}`)
      .then((r) => (r.status === 204 ? [] : r.ok ? r.json() : Promise.reject()))
      .then((rows) => {
        // one entry per day (some countries list regional holidays twice)
        const seen = new Set();
        const list = rows
          .filter((h) => !h.counties && !seen.has(h.date) && seen.add(h.date))
          .map((h) => ({ date: h.date, name: h.name, localName: h.localName }));
        memory.set(id, list);
        store.set(`holidays-${id}`, list);
        if (live) setState({ id, list, status: 'ok' });
      })
      .catch(() => live && setState({ id, list: [], status: 'error' }));
    return () => { live = false; };
  }, [id, year, country]);

  const list = state.id === id ? state.list : [];
  return { list, byDay: new Map(list.map((h) => [h.date, h])), status: state.id === id ? state.status : 'loading' };
}
