import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { apiRequest } from '../../lib/api.js';
import { BookingTicket, startCheckout } from '../access/AccessPages.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import AuthShell from '../auth/AuthShell.jsx';
import BrandLogo from '../../components/BrandLogo.jsx';

const money = (paise) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format((paise ?? 0) / 100);
const vehicleNames = { car: 'Car', motorcycle: 'Motorcycle', electric_vehicle: 'Electric vehicle' };
const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api';
const SOCKET_ORIGIN = new URL(API_BASE_URL, window.location.origin).origin;

function PageHeader({ eyebrow, title, detail, actions }) {
  return <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold uppercase tracking-[0.14em] text-emerald-800">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#14221f] sm:text-4xl">{title}</h1>{detail && <p className="mt-2 max-w-2xl text-sm leading-6 text-[#60736e]">{detail}</p>}</div>{actions}</div>;
}

function ParkingNav() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const isStaff = ['parking_owner', 'admin'].includes(user?.role);
  const links = [
    { href: '/parking', label: 'Find Parking' },
    ...(user?.role === 'customer' ? [{ href: '/bookings', label: 'My Bookings' }, { href: '/history', label: 'Parking History' }, { href: '/dashboard', label: 'Dashboard' }] : []),
    ...(isStaff ? [{ href: '/owner', label: 'Dashboard' }, { href: '/access-scanner', label: 'Access Scanner' }] : []),
    ...(user ? [{ href: '/profile', label: 'Profile' }] : []),
  ];
  const signOut = () => logout().then(() => window.location.assign('/'));
  return <header className="sticky top-0 z-30 border-b border-[#e6ede8] bg-white/95 shadow-[0_5px_24px_-22px_rgba(6,78,59,.4)] backdrop-blur-md"><nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 lg:px-10">
    <BrandLogo />
    <div className="hidden items-center gap-7 text-sm md:flex">{links.map((link) => <a key={link.href} href={link.href} className="font-semibold text-[#53675e] transition hover:text-[#064e3b]">{link.label}</a>)}</div>
    <div className="hidden items-center gap-3 md:flex">{user ? <><span className="max-w-32 truncate text-sm font-medium text-[#53675e]">{user.name}</span><button className="rounded-xl border border-[#dce7e0] px-4 py-2.5 text-sm font-semibold text-[#26483b] transition hover:bg-[#f2f7f3]" onClick={signOut}>Sign Out</button></> : <><a className="rounded-xl px-3 py-2.5 text-sm font-semibold text-[#064e3b] transition hover:bg-emerald-50" href="/login">Sign In</a><a className="rounded-xl bg-[#064e3b] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#043c2e]" href="/register">Get Started</a></>}</div>
    <button type="button" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen((open) => !open)} className="grid size-10 place-items-center rounded-xl border border-[#e2eae5] text-[#064e3b] transition hover:bg-[#f2f7f3] md:hidden"><span aria-hidden="true" className="text-xl">{menuOpen ? '×' : '☰'}</span></button>
  </nav>{menuOpen && <div id="mobile-navigation" className="border-t border-[#e6ede8] bg-white px-5 py-3 shadow-lg md:hidden"><div className="mx-auto flex max-w-7xl flex-col">{links.map((link) => <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-3 text-sm font-semibold text-[#40594e] hover:bg-[#f2f7f3]">{link.label}</a>)}{user ? <button onClick={signOut} className="mt-2 rounded-lg border border-[#dce7e0] px-3 py-3 text-left text-sm font-semibold text-[#064e3b]">Sign Out</button> : <div className="mt-2 grid grid-cols-2 gap-2"><a href="/login" className="rounded-lg border border-[#dce7e0] px-3 py-3 text-center text-sm font-semibold text-[#064e3b]">Sign In</a><a href="/register" className="rounded-lg bg-[#064e3b] px-3 py-3 text-center text-sm font-semibold text-white">Get Started</a></div>}</div></div>}</header>;
}

function StateMessage({ kind = 'info', children }) {
  const classes = kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : kind === 'empty' ? 'border-[#e1e8e4] bg-white text-[#60736e]' : 'border-emerald-100 bg-emerald-50 text-emerald-900';
  return <div className={`rounded-2xl border px-5 py-4 text-sm leading-6 ${classes}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

function Toast({ toast, onDismiss }) {
  useEffect(() => { if (!toast) return undefined; const timer = window.setTimeout(onDismiss, 5200); return () => window.clearTimeout(timer); }, [toast, onDismiss]);
  if (!toast) return null;
  return <div className="fixed bottom-5 right-5 z-50 w-[min(24rem,calc(100vw-2.5rem))] animate-rise rounded-2xl border border-emerald-100 bg-white p-4 shadow-2xl shadow-emerald-950/15" role="status" aria-live="polite"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 font-bold text-[#064e3b]">✓</span><div className="min-w-0 flex-1"><p className="text-sm font-bold text-[#17392f]">{toast.title}</p><p className="mt-1 text-sm leading-5 text-[#64756e]">{toast.detail}</p></div><button onClick={onDismiss} aria-label="Dismiss notification" className="rounded-md px-2 text-lg leading-none text-[#73847e] hover:bg-slate-100">×</button></div></div>;
}

function ParkingCard({ location }) {
  return <article className="group overflow-hidden rounded-[1.35rem] border border-[#e5ece7] bg-white shadow-[0_12px_40px_-34px_rgba(6,78,59,.5)] transition duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-950/7">
    <div className="parking-card-art relative flex h-40 items-end justify-between p-5"><span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-[#064e3b] shadow-sm">{location.availableSlots} spaces available</span><span className="grid size-11 place-items-center rounded-2xl bg-[#064e3b] text-xl text-white shadow-lg shadow-emerald-950/15">P</span></div>
    <div className="p-5"><h2 className="text-lg font-semibold tracking-tight">{location.name}</h2><p className="mt-1 text-sm text-[#60736e]">{location.address.city}, {location.address.state}</p><p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-[#73847e]">{location.description || 'Convenient parking close to your destination.'}</p><div className="mt-5 flex items-center justify-between border-t border-[#edf1ee] pt-4"><span className="text-sm text-[#60736e]">{location.minHourlyPricePaise ? `from ${money(location.minHourlyPricePaise)}/hr` : 'Prices vary'}</span><a href={`/parking/${location.id}`} className="rounded-xl bg-[#064e3b] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#043c2e] group-hover:shadow-md">Choose a space <span aria-hidden="true">→</span></a></div></div>
  </article>;
}

function localDate(value) {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 10);
}
function initialSearchFilters() {
  const arrival = new Date(); arrival.setDate(arrival.getDate() + 1);
  return { q: '', city: '', date: localDate(arrival), startTime: '10:00', endTime: '11:00', vehicleType: '', minPrice: '', maxPrice: '', availableOnly: false };
}

function ParkingSlotMap({ slots, selectedSlotId, onSelect, onConfirm, booking, loading, start, end }) {
  const [floor, setFloor] = useState('all');
  const floorOptions = [...new Set(slots.map((slot) => slot.floor).filter((value) => value !== undefined && value !== null && String(value).trim()))].map(String).sort();
  const visibleSlots = floor === 'all' ? slots : slots.filter((slot) => String(slot.floor) === floor);
  const counts = visibleSlots.reduce((result, slot) => {
    result.total += 1;
    if (slot.status === 'occupied') result.occupied += 1;
    else if (slot.status === 'reserved') result.reserved += 1;
    else if (slot.status === 'active' && slot.available) result.available += 1;
    else if (slot.status === 'active') result.unavailable += 1;
    else if (slot.status === 'maintenance') result.maintenance += 1;
    return result;
  }, { total: 0, available: 0, unavailable: 0, reserved: 0, occupied: 0, maintenance: 0 });
  const hasOccupiedData = visibleSlots.some((slot) => slot.status === 'occupied');
  const hasReservedData = visibleSlots.some((slot) => slot.status === 'reserved');
  const selected = slots.find((slot) => slot.id === selectedSlotId);
  const hours = start && end ? Math.max(0, Math.ceil((new Date(end) - new Date(start)) / 3_600_000)) : 0;
  const estimated = selected ? hours * selected.hourlyPricePaise : 0;
  const visualState = (slot) => slot.status === 'occupied' ? 'occupied' : slot.status === 'reserved' ? 'reserved' : slot.status !== 'active' ? 'offline' : slot.available ? 'available' : 'offline';
  const stateLabels = { available: 'Available', reserved: 'Reserved', occupied: 'Occupied', offline: slot => slot.status === 'maintenance' ? 'Maintenance' : 'Unavailable' };
  const classes = {
    available: 'border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-500 hover:bg-emerald-100',
    reserved: 'cursor-not-allowed border-amber-300 bg-amber-100 text-amber-950',
    occupied: 'cursor-not-allowed border-red-200 bg-red-50 text-red-950',
    offline: 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-500',
    selected: 'border-sky-500 bg-sky-50 text-sky-950 ring-2 ring-sky-200',
  };

  return <div className="overflow-hidden rounded-[1.65rem] border border-[#e5ece7] bg-white shadow-[0_16px_55px_-36px_rgba(6,78,59,.34)]">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#edf1ee] px-5 py-5 sm:px-7">
      <div><p className="text-xs font-bold uppercase tracking-[.17em] text-emerald-800">Live inventory</p><h2 className="mt-1 text-xl font-semibold text-[#14221f]">Choose your space</h2><p className="mt-1 text-sm text-[#73847e]">Availability for your selected arrival and departure.</p></div>
      {floorOptions.length > 0 && <label className="text-xs font-semibold text-[#55706a]">Floor<select className="auth-field mt-1 min-w-36 py-2" value={floor} onChange={(event) => setFloor(event.target.value)}><option value="all">All floors</option>{floorOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}
    </div>
    <div className="grid grid-cols-2 gap-px bg-[#edf1ee] sm:grid-cols-3 xl:grid-cols-5">
      {[["Total spaces", counts.total, 'text-[#14221f]'], ['Available', counts.available, 'text-emerald-800'], ['Reserved', hasReservedData ? counts.reserved : '—', 'text-orange-700'], ['Occupied', hasOccupiedData ? counts.occupied : '—', 'text-red-700'], ['Unavailable', counts.unavailable + counts.maintenance, 'text-slate-600']].map(([label, value, color]) => <div key={label} className="bg-white px-5 py-4"><p className="text-xs text-[#73847e]">{label}</p><p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p></div>)}
    </div>
    <div className="px-5 py-5 sm:px-7 sm:py-7">
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-[#60736e]" aria-label="Parking availability legend">
      {[['bg-emerald-500', 'Available'], ['bg-yellow-400', 'Reserved'], ['bg-red-500', 'Occupied'], ['bg-slate-400', 'Maintenance / unavailable'], ['bg-sky-500', 'Selected']].map(([color, label]) => <span key={label} className="inline-flex items-center gap-2"><i className={`size-2.5 rounded-full ${color}`} />{label}</span>)}
      </div>
      <p className="mb-4 text-xs leading-5 text-[#73847e]">Availability updates from the parking service. Its slot response does not distinguish reserved spaces from other time-window conflicts or report live occupancy. Floor labels appear only when the location provides them.</p>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="parking-lot rounded-2xl border border-[#e1e8e4] p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-center gap-2 rounded-lg bg-white/75 py-2 text-[10px] font-bold uppercase tracking-[.22em] text-[#73847e]"><span className="h-px w-8 bg-[#cad7cf]"/>Entry &amp; drive aisle<span className="h-px w-8 bg-[#cad7cf]"/></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {visibleSlots.map((slot) => { const state = visualState(slot); const isSelected = slot.id === selectedSlotId; const stateLabel = typeof stateLabels[state] === 'function' ? stateLabels[state](slot) : stateLabels[state]; return <button key={slot.id} type="button" disabled={state !== 'available' || loading} aria-pressed={isSelected} title={`${slot.slotNumber} · ${stateLabel} · ${money(slot.hourlyPricePaise)} per hour`} onClick={() => onSelect(slot)} className={`parking-slot relative min-h-32 rounded-xl border-2 p-3 text-left transition-all duration-200 sm:min-h-36 ${classes[isSelected ? 'selected' : state]} ${state === 'available' ? 'hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
            <span className="flex items-start justify-between"><span className="text-lg font-bold tracking-tight">{slot.slotNumber}</span><span className={`mt-1 size-2.5 rounded-full ${isSelected ? 'bg-sky-500' : state === 'available' ? 'animate-availability bg-emerald-500' : state === 'reserved' ? 'bg-yellow-400' : state === 'occupied' ? 'bg-red-500' : 'bg-slate-400'}`} /></span>
            <span className="parking-stall-icon" aria-hidden="true"><svg viewBox="0 0 48 30" className="size-9" fill="none"><path d="m8 19 2-7a4 4 0 0 1 4-3h20a4 4 0 0 1 4 3l2 7v6h-4v-3H12v3H8v-6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M13 17h22M15 22h.01M33 22h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg><span className="sr-only">{vehicleNames[slot.vehicleType]}</span></span>
            <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide">{isSelected ? 'Selected' : stateLabel}</span><span className="mt-1 block text-xs font-semibold">{money(slot.hourlyPricePaise)}<span className="font-normal opacity-75"> / hr</span></span>
          </button>; })}
        </div>
        {!visibleSlots.length && <p className="py-8 text-center text-sm text-[#73847e]">No spaces are listed for these filters.</p>}
        <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-white/75 py-2 text-[10px] font-bold uppercase tracking-[.22em] text-[#73847e]">Exit lane<span className="h-px w-8 bg-[#cad7cf]"/></div>
      </div>
      <aside className="rounded-2xl border border-[#dce8e0] bg-[#f7faf8] p-5 xl:sticky xl:top-24" aria-live="polite"><p className="text-xs font-bold uppercase tracking-[.14em] text-emerald-800">Selected space</p>{selected ? <><h3 className="mt-2 text-xl font-semibold">{selected.slotNumber}</h3><p className="mt-1 text-sm text-[#60736e]">{vehicleNames[selected.vehicleType]} · {money(selected.hourlyPricePaise)} / hour</p><div className="my-5 space-y-3 border-y border-[#dce7e0] py-4 text-sm"><div className="flex justify-between gap-3"><span className="text-[#73847e]">Arrival</span><span className="text-right font-medium">{start ? new Date(start).toLocaleString() : 'Choose arrival'}</span></div><div className="flex justify-between gap-3"><span className="text-[#73847e]">Departure</span><span className="text-right font-medium">{end ? new Date(end).toLocaleString() : 'Choose departure'}</span></div><div className="flex justify-between gap-3"><span className="text-[#73847e]">Billable time</span><span className="font-medium">{hours} hour{hours === 1 ? '' : 's'}</span></div></div><div className="flex items-end justify-between gap-2"><span className="text-sm text-[#60736e]">Estimate</span><strong className="text-xl text-[#14221f]">{money(estimated)}</strong></div><button type="button" disabled={booking || loading || !start || !end || new Date(end) <= new Date(start)} onClick={() => onConfirm(selected)} className="mt-5 w-full rounded-xl bg-[#064e3b] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#043c2e] disabled:cursor-not-allowed disabled:bg-slate-300">{booking ? 'Confirming…' : loading ? 'Refreshing availability…' : 'Review booking'}</button><p className="mt-3 text-xs leading-5 text-[#73847e]">Final price and availability are confirmed by the server.</p></> : <div className="mt-4 rounded-xl border border-dashed border-[#cad7cf] bg-white/70 px-4 py-6 text-center"><p className="text-sm font-semibold text-[#47645a]">Choose an available space</p><p className="mt-1 text-xs leading-5 text-[#73847e]">Select a green space on the map to see its price and booking details here.</p></div>}</aside>
      </div>
      <p className="mt-4 text-xs text-[#879690]">Prices are estimates. The server calculates the final booking total and confirms the reservation.</p>
    </div>
  </div>;
}

export function ParkingSearchPage() {
  const [filters, setFilters] = useState(initialSearchFilters);
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const requestSequence = useRef(0);
  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const search = useCallback(async (activeQuery) => {
    const sequence = ++requestSequence.current;
    if (!activeQuery.date || !activeQuery.startTime || !activeQuery.endTime) { setError('Choose an arrival date, entry time, and exit time.'); setLoading(false); return; }
    const startAt = new Date(`${activeQuery.date}T${activeQuery.startTime}`);
    const endAt = new Date(`${activeQuery.date}T${activeQuery.endTime}`);
    if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) { setError('Exit time must be after entry time on the selected date.'); setLoading(false); return; }
    if (startAt <= new Date()) { setError('Choose an arrival time in the future.'); setLoading(false); return; }
    if (activeQuery.minPrice && activeQuery.maxPrice && Number(activeQuery.minPrice) > Number(activeQuery.maxPrice)) { setError('Minimum price must be less than or equal to maximum price.'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (activeQuery.q) params.set('q', activeQuery.q);
      if (activeQuery.city) params.set('city', activeQuery.city);
      if (activeQuery.vehicleType) params.set('vehicleType', activeQuery.vehicleType);
      if (activeQuery.maxPrice) params.set('maxHourlyPricePaise', String(Math.round(Number(activeQuery.maxPrice) * 100)));
      params.set('startAt', startAt.toISOString()); params.set('endAt', endAt.toISOString());
      const result = await apiRequest(`/locations?${params.toString()}`);
      if (sequence === requestSequence.current) { setLocations(result.locations); setSearched(true); }
    } catch (requestError) { if (sequence === requestSequence.current) { setError(requestError.message); setLocations([]); } }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => search(filters), 300); return () => window.clearTimeout(timer); }, [filters, search]);
  function submit(event) { event.preventDefault(); search(filters); }
  const results = locations.filter((location) => {
    if (filters.availableOnly && location.availableSlots < 1) return false;
    if (filters.minPrice && location.minHourlyPricePaise !== null && location.minHourlyPricePaise < Number(filters.minPrice) * 100) return false;
    return true;
  });
  const clearFilters = () => setFilters({ ...initialSearchFilters(), date: filters.date, startTime: '10:00', endTime: '11:00' });

  return <div className="min-h-screen bg-[#f6f8f7]"><ParkingNav/><main className="mx-auto max-w-7xl px-5 py-9 lg:px-10 lg:py-12">
    <PageHeader eyebrow="Find your space" title="A better spot for your next stop." detail="Search real parking inventory, check availability for your schedule, and choose the right space."/>
    <form className="mb-8 rounded-[1.5rem] border border-[#e4ebe6] bg-white p-4 shadow-[0_15px_50px_-40px_rgba(6,78,59,.45)] sm:p-6" onSubmit={submit}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-[#17392f]">Plan your parking</h2><p className="mt-1 text-xs text-[#73847e]">Results refresh as you adjust your search.</p></div><label className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#f2f7f3] px-3 py-2.5 text-sm font-semibold text-[#26483b]"><input type="checkbox" checked={filters.availableOnly} onChange={(event) => updateFilter('availableOnly', event.target.checked)} className="size-4 accent-[#064e3b]"/>Available spaces only</label></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold text-[#55706a] lg:col-span-2">Location or area<input aria-label="Search location or area" className="auth-field mt-1.5" placeholder="Search a place or neighborhood" value={filters.q} onChange={(event) => updateFilter('q', event.target.value)}/></label>
        <label className="text-xs font-semibold text-[#55706a]">City<input className="auth-field mt-1.5" placeholder="Any city" value={filters.city} onChange={(event) => updateFilter('city', event.target.value)}/></label>
        <label className="text-xs font-semibold text-[#55706a]">Vehicle type<select className="auth-field mt-1.5" value={filters.vehicleType} onChange={(event) => updateFilter('vehicleType', event.target.value)}><option value="">All vehicle types</option><option value="car">Car</option><option value="motorcycle">Motorcycle</option><option value="electric_vehicle">Electric vehicle</option></select></label>
        <label className="text-xs font-semibold text-[#55706a]">Arrival date<input required min={localDate(new Date())} className="auth-field mt-1.5" type="date" value={filters.date} onChange={(event) => updateFilter('date', event.target.value)}/></label>
        <label className="text-xs font-semibold text-[#55706a]">Entry time<input required className="auth-field mt-1.5" type="time" value={filters.startTime} onChange={(event) => updateFilter('startTime', event.target.value)}/></label>
        <label className="text-xs font-semibold text-[#55706a]">Exit time<input required className="auth-field mt-1.5" type="time" min={filters.startTime} value={filters.endTime} onChange={(event) => updateFilter('endTime', event.target.value)}/></label>
        <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-[#55706a]">Min ₹ / hour<input className="auth-field mt-1.5" type="number" min="0" step="1" placeholder="No min" value={filters.minPrice} onChange={(event) => updateFilter('minPrice', event.target.value)}/></label><label className="text-xs font-semibold text-[#55706a]">Max ₹ / hour<input className="auth-field mt-1.5" type="number" min="1" step="1" placeholder="No max" value={filters.maxPrice} onChange={(event) => updateFilter('maxPrice', event.target.value)}/></label></div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-[#edf1ee] pt-4"><span className="mr-auto text-xs text-[#879690]">Availability and prices come from Smart Parking inventory.</span><button type="button" onClick={clearFilters} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-[#47645a] transition hover:bg-[#f2f7f3]">Reset filters</button><button className="rounded-xl bg-[#064e3b] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#043c2e]">Update results <span aria-hidden="true">→</span></button></div>
    </form>
    <div className="mb-4 flex items-center justify-between"><div><h2 className="font-semibold text-[#253b34]">Parking near you</h2><p className="mt-1 text-xs text-[#879690]">{filters.date ? `${filters.date} · ${filters.startTime}–${filters.endTime}` : ''}</p></div><span className="text-sm text-[#73847e]">{loading ? 'Updating results…' : `${results.length} locations`}</span></div>
    {error ? <StateMessage kind="error">{error}</StateMessage> : loading && !searched ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="h-80 animate-pulse rounded-2xl bg-[#e9efeb]"/>)}</div> : loading ? <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-xs text-emerald-900" role="status">Refreshing parking availability…</div> : results.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{results.map((location) => <ParkingCard key={location.id} location={location}/>)}</div> : <StateMessage kind="empty">{searched ? 'No parking matched those filters. Try a wider time window or price range.' : 'Search parking locations to see available spaces.'}</StateMessage>}
    <div className="mt-10 rounded-2xl bg-[#17392f] px-6 py-7 text-white sm:flex sm:items-center sm:justify-between"><div><p className="text-sm text-emerald-100/70">PARKING OPERATORS</p><h2 className="mt-1 text-xl font-semibold">Manage a parking location?</h2></div><a className="mt-4 inline-flex rounded-full bg-[#d2e3d4] px-5 py-3 text-sm font-semibold text-emerald-950 sm:mt-0" href="/owner">Open owner dashboard <span className="ml-2">↗</span></a></div>
  </main></div>;
}

function toLocalDateTime(value) {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}
function defaultWindow() {
  const start = new Date(Math.ceil((Date.now() + 24 * 60 * 60 * 1000) / 60_000) * 60_000);
  return { start: toLocalDateTime(start), end: toLocalDateTime(new Date(start.getTime() + 60 * 60_000)) };
}

export function ParkingDetailsPage({ locationId }) {
  const { user, loading: authLoading } = useAuth();
  const defaults = useMemo(defaultWindow, []);
  const [location, setLocation] = useState(null);
  const [slots, setSlots] = useState([]);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [availabilityError, setAvailabilityError] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [selectedSlotId, setSelectedSlotId] = useState('');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [bookingReview, setBookingReview] = useState(null);
  const [bookingConfirmation, setBookingConfirmation] = useState(null);
  const [bookingToast, setBookingToast] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true); setAvailabilityError('');
    try {
      const locationResult = await apiRequest(`/locations/${locationId}`);
      setLocation(locationResult.location);
      const params = new URLSearchParams();
      if (start && end) { params.set('startAt', new Date(start).toISOString()); params.set('endAt', new Date(end).toISOString()); }
      if (vehicleType) params.set('vehicleType', vehicleType);
      const result = await apiRequest(`/locations/${locationId}/slots?${params.toString()}`);
      setSlots(result.slots);
    } catch (requestError) { setAvailabilityError(requestError.message); }
    finally { setLoading(false); }
  }, [locationId, start, end, vehicleType]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (selectedSlotId && !slots.some((slot) => slot.id === selectedSlotId && slot.available && slot.status === 'active')) setSelectedSlotId('');
  }, [slots, selectedSlotId]);
  useEffect(() => {
    if (authLoading) return undefined;
    const socket = io(SOCKET_ORIGIN, { path: '/api/v1/socket.io', withCredentials: true, reconnectionAttempts: 2 });
    socket.on('connect', () => { setRealtimeConnected(true); socket.emit('availability:subscribe', { locationId }); });
    socket.on('disconnect', () => setRealtimeConnected(false));
    socket.on('availability:update', (event) => { if (event.locationId === locationId) refresh(); });
    return () => { socket.emit('availability:unsubscribe', { locationId }); socket.disconnect(); };
  }, [locationId, authLoading, refresh]);

  async function reserve(slot) {
    setMessage(''); setError(''); setBookingConfirmation(null);
    if (!user) { window.location.assign('/login'); return; }
    if (user.role !== 'customer') { setError('Parking reservations are available to customer accounts.'); return; }
    setBooking(true);
    try {
      const result = await apiRequest('/bookings', { method: 'POST', body: JSON.stringify({ locationId, slotId: slot.id, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() }) });
      setSelectedSlotId('');
      setBookingReview(null);
      setBookingConfirmation({ id: result.booking.id, slotNumber: slot.slotNumber, amountPaise: result.booking.amountPaise, billableHours: result.price.billableHours });
      setBookingToast({ title: 'Booking created', detail: `Space ${slot.slotNumber} · ${money(result.booking.amountPaise)}. Complete payment from My Bookings.` });
      await refresh();
    } catch (requestError) { setError(requestError.message); await refresh(); }
    finally { setBooking(false); }
  }

  function openBookingReview(slot) {
    if (!user) { window.location.assign('/login'); return; }
    if (user.role !== 'customer') { setError('Parking reservations are available to customer accounts.'); return; }
    setError(''); setBookingReview(slot);
  }

  return <div className="min-h-screen bg-[#f6f8f7]"><ParkingNav/><main className="mx-auto max-w-7xl px-5 py-9 lg:px-10 lg:py-12">
    <a href="/parking" className="text-sm font-semibold text-emerald-800 hover:underline">← Back to search</a>
    {availabilityError && !location ? <div className="mt-6"><StateMessage kind="error">{availabilityError}</StateMessage></div> : location && <>
      <section className="mt-6 overflow-hidden rounded-[2rem] bg-[#17392f] p-7 text-white sm:p-10"><p className="text-sm font-semibold uppercase tracking-[0.15em] text-emerald-100/70">{location.address.city} · {location.address.state}</p><h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">{location.name}</h1><p className="mt-4 max-w-2xl leading-7 text-emerald-50/75">{location.description}</p><p className="mt-5 text-sm text-emerald-50/70">{location.address.line1}{location.address.line2 ? `, ${location.address.line2}` : ''}, {location.address.city}, {location.address.postalCode}, {location.address.country}</p><div className="mt-5 border-t border-white/15 pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-emerald-100/70">Operating hours · {location.timezone}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-50/85">{location.operatingHours.map((hours) => <span key={hours.day}>{weekdayNames[hours.day].slice(0,3)}: {hours.closed ? 'Closed' : `${hours.openAt}–${hours.closeAt}`}</span>)}</div></div></section>
      <section className="mt-8 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="parking-control h-fit rounded-[1.5rem] border border-[#e5ece7] bg-white p-5 shadow-[0_16px_45px_-36px_rgba(6,78,59,.4)] sm:p-6"><div className="grid size-11 place-items-center rounded-xl bg-[#e8f3ec] text-xl text-[#064e3b]">◷</div><h2 className="mt-4 text-lg font-semibold tracking-tight">Plan your arrival</h2><p className="mt-1 text-sm text-[#73847e]">Choose a time and vehicle to view matching spaces.</p><div className="mt-5 space-y-4"><label className="block text-sm font-semibold text-[#47645a]">Arrival<input required min={toLocalDateTime(new Date(Date.now() + 60_000))} className="auth-field mt-1.5" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)}/></label><label className="block text-sm font-semibold text-[#47645a]">Departure<input required min={start} className="auth-field mt-1.5" type="datetime-local" value={end} onChange={(event) => setEnd(event.target.value)}/></label><label className="block text-sm font-semibold text-[#47645a]">Vehicle type<select className="auth-field mt-1.5" value={vehicleType} onChange={(event) => setVehicleType(event.target.value)}><option value="">All vehicle types</option><option value="car">Car</option><option value="motorcycle">Motorcycle</option><option value="electric_vehicle">Electric vehicle</option></select></label><div className="rounded-xl bg-[#f4f8f5] p-3 text-xs leading-5 text-[#64756e]">Prices are calculated by the hour. Your booking total is confirmed by the server.</div></div></div>
        <div><div className="mb-4 flex items-end justify-between"><div><h2 className="text-xl font-semibold">Live slot map</h2><p className="mt-1 text-sm text-[#73847e]">{slots.filter((slot) => slot.available && slot.status === 'active').length} available for your selected time</p></div>{loading ? <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">Updating…</span> : <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${realtimeConnected ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-100 text-slate-600'}`}><i className={`size-2 rounded-full ${realtimeConnected ? 'animate-availability bg-emerald-500' : 'bg-slate-400'}`}/>{realtimeConnected ? 'Live updates' : 'Availability'}</span>}</div>
          {bookingConfirmation && <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5" role="status"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-800">Booking confirmed</p><h3 className="mt-1 text-lg font-semibold text-[#17392f]">Space {bookingConfirmation.slotNumber} is reserved</h3><p className="mt-1 text-sm text-[#50645c]">{bookingConfirmation.billableHours} billable hour{bookingConfirmation.billableHours === 1 ? '' : 's'} · {money(bookingConfirmation.amountPaise)}</p><p className="mt-1 text-xs text-[#73847e]">Booking reference {bookingConfirmation.id}</p></div><a href="/bookings" className="rounded-xl bg-[#064e3b] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#043c2e]">View booking &amp; pay</a></div></div>}{message && <div className="mb-4"><StateMessage>{message}</StateMessage></div>}{error && <div className="mb-4"><StateMessage kind="error">{error}</StateMessage></div>}{availabilityError && location && <div className="mb-4"><StateMessage kind="error">{availabilityError}</StateMessage></div>}
          {loading ? <div className="animate-pulse rounded-[1.65rem] bg-white p-7 shadow-sm"><div className="h-7 w-52 rounded bg-[#e9efeb]"/><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-16 rounded-xl bg-[#e9efeb]" />)}</div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-28 rounded-xl bg-[#e9efeb]" />)}</div></div> : slots.length ? <ParkingSlotMap slots={slots} selectedSlotId={selectedSlotId} onSelect={(slot) => setSelectedSlotId(slot.id)} onConfirm={openBookingReview} booking={booking} loading={loading} start={start} end={end}/> : <StateMessage kind="empty">No spaces match your selected vehicle and time. Try a different window.</StateMessage>}
        </div>
      </section>
    </>}
  </main>{bookingReview && <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-[#10251d]/55 p-4 backdrop-blur-sm" onKeyDown={(event) => { if (event.key === 'Escape') setBookingReview(null); }}><section role="dialog" aria-modal="true" aria-labelledby="booking-review-title" tabIndex={-1} className="my-auto w-full max-w-lg rounded-3xl border border-white/70 bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-emerald-800">Final check</p><h2 id="booking-review-title" className="mt-2 text-2xl font-semibold tracking-tight">Review your booking</h2></div><button onClick={() => setBookingReview(null)} aria-label="Close booking review" className="grid size-9 place-items-center rounded-full bg-slate-100 text-xl text-slate-600 hover:bg-slate-200">×</button></div><div className="mt-6 rounded-2xl bg-[#f3f7f4] p-5"><p className="font-semibold">{location?.name} · Space {bookingReview.slotNumber}</p><p className="mt-2 text-sm text-[#60736e]">{new Date(start).toLocaleString()} – {new Date(end).toLocaleString()}</p><p className="mt-1 text-sm text-[#60736e]">{vehicleNames[bookingReview.vehicleType]} · {money(bookingReview.hourlyPricePaise)} per hour</p><div className="mt-4 flex items-center justify-between border-t border-[#dce7e0] pt-4"><span className="text-sm font-semibold text-[#53675e]">Estimated total</span><strong className="text-xl text-[#17392f]">{money(Math.ceil((new Date(end) - new Date(start)) / 3_600_000) * bookingReview.hourlyPricePaise)}</strong></div></div><p className="mt-4 text-xs leading-5 text-[#73847e]">The server validates current availability and calculates your final price. Confirming creates a booking; payment is completed from My Bookings.</p><div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button onClick={() => setBookingReview(null)} className="rounded-xl border border-[#dce7e0] px-5 py-3 text-sm font-semibold text-[#26483b] transition hover:bg-[#f2f7f3]">Back to slots</button><button disabled={booking} autoFocus onClick={() => reserve(bookingReview)} className="rounded-xl bg-[#064e3b] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#043c2e] disabled:opacity-60">{booking ? 'Confirming…' : 'Confirm booking'}</button></div></section></div>}<Toast toast={bookingToast} onDismiss={() => setBookingToast(null)}/></div>;
}

const blankLocation = { name: '', description: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'India', latitude: '', longitude: '', timezone: 'Asia/Kolkata', openAt: '06:00', closeAt: '23:00', closedDays: [0] };

export function OwnerDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [locations, setLocations] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [form, setForm] = useState(blankLocation);
  const [slotForms, setSlotForms] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [paymentMessage, setPaymentMessage] = useState('');
  const allowed = user && ['parking_owner', 'admin'].includes(user.role);

  const load = useCallback(async () => {
    if (!allowed) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [locationResult, bookingResult] = await Promise.all([apiRequest('/owner/locations'), apiRequest('/owner/bookings')]);
      setLocations(locationResult.locations);
      setBookings(bookingResult.bookings);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [allowed]);
  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  async function createLocation(event) {
    event.preventDefault(); setError(''); setNotice(''); setSaving(true);
    const { line1, line2, city, state, postalCode, country, latitude, longitude, openAt, closeAt, closedDays, ...details } = form;
    try {
      const operatingHours = weekdayNames.map((_, day) => ({ day, closed: closedDays.includes(day), openAt, closeAt }));
      await apiRequest('/locations', { method: 'POST', body: JSON.stringify({ ...details, address: { line1, line2, city, state, postalCode, country }, coordinates: { latitude: Number(latitude), longitude: Number(longitude) }, operatingHours }) });
      setForm(blankLocation); setNotice('Parking location created.'); await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  }

  async function updateLocation(location, patch) {
    setError(''); setNotice('');
    try { await apiRequest(`/locations/${location.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); setNotice(`${location.name} updated.`); await load(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function archiveLocation(location) {
    setError(''); setNotice('');
    try { await apiRequest(`/locations/${location.id}`, { method: 'DELETE' }); setNotice(`${location.name} archived.`); await load(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function addSlot(event, location) {
    event.preventDefault(); setError(''); setNotice('');
    const values = slotForms[location.id] ?? { slotNumber: '', vehicleType: 'car', price: '' };
    try {
      await apiRequest(`/locations/${location.id}/slots`, { method: 'POST', body: JSON.stringify({ slotNumber: values.slotNumber, vehicleType: values.vehicleType, hourlyPricePaise: Math.round(Number(values.price) * 100) }) });
      setSlotForms({ ...slotForms, [location.id]: { ...values, slotNumber: '', price: '' } }); setNotice(`Space added to ${location.name}.`); await load();
    } catch (requestError) { setError(requestError.message); }
  }

  async function setSlotStatus(location, slot, status) {
    try { await apiRequest(`/locations/${location.id}/slots/${slot.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); setNotice(`Space ${slot.slotNumber} updated.`); await load(); }
    catch (requestError) { setError(requestError.message); }
  }

  async function completeBooking(id) {
    try { await apiRequest(`/owner/bookings/${id}/complete`, { method: 'POST' }); setNotice('Booking marked complete.'); await load(); }
    catch (requestError) { setError(requestError.message); }
  }

  if (authLoading) return <div className="min-h-screen bg-[#f6f8f7]"><ParkingNav/><main className="mx-auto max-w-7xl p-8"><StateMessage>Loading your secure session…</StateMessage></main></div>;
  if (!allowed) return <><ParkingNav/><AuthShell title={user ? 'Owner access required' : 'Sign in to manage parking'} subtitle={user ? 'This dashboard is reserved for parking owners and administrators.' : 'Sign in with a parking owner or admin account to continue.'}><a href="/login" className="block rounded-full bg-emerald-800 px-5 py-3 text-center text-sm font-semibold text-white">Go to sign in</a></AuthShell></>;

  return <div className="min-h-screen bg-[#f6f8f7]"><ParkingNav/><main className="mx-auto max-w-7xl px-5 py-9 lg:px-10 lg:py-12">
    <PageHeader eyebrow="Operations" title="Parking owner dashboard" detail="Manage your locations and spaces, and keep track of upcoming reservations." actions={<span className="rounded-full border border-[#dce5e1] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#55706a]">{user.role.replace('_', ' ')}</span>}/>
    {error && <div className="mb-4"><StateMessage kind="error">{error}</StateMessage></div>}{notice && <div className="mb-4"><StateMessage>{notice}</StateMessage></div>}
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]"><section className="h-fit rounded-2xl border border-[#e1e8e4] bg-white p-5 sm:p-6"><h2 className="text-xl font-semibold">Add a location</h2><p className="mt-1 text-sm text-[#73847e]">Set the address and map coordinates your customers will see.</p><form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={createLocation}>
      {[['name','Location name'],['line1','Street address'],['line2','Address line 2'],['city','City'],['state','State / region'],['postalCode','Postal code'],['country','Country'],['latitude','Latitude'],['longitude','Longitude'],['timezone','IANA timezone']].map(([key,label]) => <label key={key} className="text-xs font-semibold text-[#55706a]">{label}<input required={key !== 'line2'} className="auth-field mt-1.5" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} type={['latitude','longitude'].includes(key) ? 'number' : 'text'} step={['latitude','longitude'].includes(key) ? 'any' : undefined}/></label>)}
      <label className="text-xs font-semibold text-[#55706a]">Opens<input required className="auth-field mt-1.5" type="time" value={form.openAt} onChange={(event) => setForm({ ...form, openAt: event.target.value })}/></label><label className="text-xs font-semibold text-[#55706a]">Closes<input required className="auth-field mt-1.5" type="time" value={form.closeAt} onChange={(event) => setForm({ ...form, closeAt: event.target.value })}/></label>
      <fieldset className="sm:col-span-2"><legend className="text-xs font-semibold text-[#55706a]">Closed days</legend><div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-7">{weekdayNames.map((day, index) => <label key={day} className="flex items-center gap-2 rounded-lg bg-[#f6f8f7] px-2.5 py-2 text-xs text-[#47645a]"><input type="checkbox" checked={form.closedDays.includes(index)} onChange={(event) => setForm({ ...form, closedDays: event.target.checked ? [...form.closedDays, index] : form.closedDays.filter((value) => value !== index) })}/>{day.slice(0,3)}</label>)}</div></fieldset>
      <label className="text-xs font-semibold text-[#55706a] sm:col-span-2">Description<textarea className="auth-field mt-1.5 min-h-20 resize-y" maxLength={1500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label><button disabled={saving} className="rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-60 sm:col-span-2">{saving ? 'Saving…' : 'Create parking location'}</button>
    </form></section>

    <section><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Your locations</h2><span className="text-sm text-[#73847e]">{locations.length} total</span></div>{loading ? <StateMessage>Loading locations…</StateMessage> : !locations.length ? <StateMessage kind="empty">No locations yet. Create one to start listing parking spaces.</StateMessage> : <div className="space-y-4">{locations.map((location) => <article key={location.id} className="rounded-2xl border border-[#e1e8e4] bg-white p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{location.name}</h3><p className="mt-1 text-sm text-[#60736e]">{location.address.city}, {location.address.state} · {location.slotCount} spaces</p><p className="mt-1 text-xs text-[#879690]">{location.status}</p></div><div className="flex gap-2"><button className="rounded-full border border-[#dce5e1] px-3 py-2 text-xs font-semibold text-[#47645a]" onClick={() => { const name = window.prompt('Update location name', location.name); if (name?.trim() && name !== location.name) updateLocation(location, { name: name.trim() }); }}>Edit name</button>{location.status !== 'archived' && <button className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700" onClick={() => window.confirm(`Archive ${location.name}?`) && archiveLocation(location)}>Archive</button>}</div></div>
      <div className="mt-4 divide-y divide-[#edf1ee]">{location.slots?.length ? location.slots.map((slot) => <div key={slot.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="font-semibold">{slot.slotNumber}<span className="ml-2 font-normal text-[#73847e]">{vehicleNames[slot.vehicleType]} · {money(slot.hourlyPricePaise)}/hr</span></span><span className="flex items-center gap-3"><span className="text-xs capitalize text-[#73847e]">{slot.status}</span><button className="text-xs font-semibold text-emerald-800 hover:underline" onClick={() => setSlotStatus(location, slot, slot.status === 'active' ? 'maintenance' : 'active')}>{slot.status === 'active' ? 'Set maintenance' : 'Set active'}</button></span></div>) : <p className="py-3 text-sm text-[#879690]">No spaces listed yet.</p>}</div>
      {location.status === 'active' && <form className="mt-4 grid gap-2 border-t border-[#edf1ee] pt-4 sm:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={(event) => addSlot(event, location)}><input required className="auth-field" placeholder="Space number" value={(slotForms[location.id] ?? { slotNumber: '' }).slotNumber} onChange={(event) => setSlotForms({ ...slotForms, [location.id]: { ...(slotForms[location.id] ?? { vehicleType: 'car', price: '' }), slotNumber: event.target.value } })}/><select className="auth-field" value={(slotForms[location.id] ?? { vehicleType: 'car' }).vehicleType} onChange={(event) => setSlotForms({ ...slotForms, [location.id]: { ...(slotForms[location.id] ?? { slotNumber: '', price: '' }), vehicleType: event.target.value } })}><option value="car">Car</option><option value="motorcycle">Motorcycle</option><option value="electric_vehicle">Electric vehicle</option></select><input required min="1" step="1" type="number" className="auth-field" placeholder="Hourly ₹" value={(slotForms[location.id] ?? { price: '' }).price} onChange={(event) => setSlotForms({ ...slotForms, [location.id]: { ...(slotForms[location.id] ?? { slotNumber: '', vehicleType: 'car' }), price: event.target.value } })}/><button className="rounded-xl bg-[#edf4ef] px-4 py-3 text-sm font-semibold text-emerald-900 hover:bg-[#dce9df]">Add space</button></form>}
    </article>)}</div>}</section></div>

    <section className="mt-10"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Upcoming bookings</h2><span className="text-sm text-[#73847e]">{bookings.filter((item) => item.status === 'confirmed').length} confirmed</span></div>{loading ? <StateMessage>Loading bookings…</StateMessage> : !bookings.length ? <StateMessage kind="empty">There are no reservations to show yet.</StateMessage> : <div className="overflow-hidden rounded-2xl border border-[#e1e8e4] bg-white">{bookings.map((booking) => <div key={booking.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-[#edf1ee] p-4 last:border-0 sm:px-5"><div><p className="font-semibold">{booking.location?.name ?? 'Parking location'} · {booking.slot?.slotNumber ?? 'Space'}</p><p className="mt-1 text-sm text-[#60736e]">{booking.customer?.name ?? 'Customer'} · {new Date(booking.startAt).toLocaleString()} – {new Date(booking.endAt).toLocaleTimeString()}</p></div><div className="flex items-center gap-3"><span className="font-semibold">{money(booking.amountPaise)}</span><span className="rounded-full bg-[#edf4ef] px-3 py-1 text-xs font-semibold capitalize text-emerald-900">{booking.status}</span>{booking.status === 'confirmed' && new Date(booking.endAt) <= new Date() && <button className="text-xs font-semibold text-emerald-800" onClick={() => completeBooking(booking.id)}>Mark complete</button>}</div></div>)}</div>}</section>
  </main></div>;
}

export function CustomerBookingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    if (!user || user.role !== 'customer') { setLoading(false); return; }
    setLoading(true); setError('');
    try { const result = await apiRequest('/bookings'); setBookings(result.bookings); }
    catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);
  async function cancel(booking) {
    setError(''); setNotice('');
    try { await apiRequest(`/bookings/${booking.id}/cancel`, { method: 'POST' }); setNotice('Your reservation was cancelled.'); await load(); }
    catch (requestError) { setError(requestError.message); }
  }
  async function pay(booking) { setPaymentMessage(''); try { await startCheckout(booking.id, (message) => { setPaymentMessage(message ?? 'Payment was verified. Your access ticket is ready.'); load(); }); } catch (e) { setPaymentMessage(e.message); } }
  if (authLoading) return <div className="min-h-screen bg-[#f6f8f7]"><ParkingNav/><main className="mx-auto max-w-7xl p-8"><StateMessage>Loading your secure session…</StateMessage></main></div>;
  if (!user || user.role !== 'customer') return <><ParkingNav/><AuthShell title="Sign in to view bookings" subtitle="Your reservations are available after you sign in with a customer account."><a href="/login" className="block rounded-full bg-emerald-800 px-5 py-3 text-center text-sm font-semibold text-white">Go to sign in</a></AuthShell></>;
  return <div className="min-h-screen bg-[#f6f8f7]"><ParkingNav/><main className="mx-auto max-w-5xl px-5 py-9 lg:px-10 lg:py-12"><PageHeader eyebrow="Your account" title="My bookings" detail="Review upcoming parking, manage payments, and show your secure access ticket." actions={<div className="flex gap-2"><a href="/payments" className="rounded-full border px-4 py-2.5 text-sm font-semibold text-emerald-900">Payments</a><a href="/parking" className="rounded-full bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white">Find parking</a></div>}/>{error && <div className="mb-4"><StateMessage kind="error">{error}</StateMessage></div>}{notice && <div className="mb-4"><StateMessage>{notice}</StateMessage></div>}{paymentMessage && <div className="mb-4"><StateMessage kind={paymentMessage.includes('cancelled') || paymentMessage.includes('failed') ? 'error' : 'default'}>{paymentMessage}</StateMessage></div>}{loading ? <StateMessage>Loading your bookings…</StateMessage> : bookings.length ? <div className="space-y-3">{bookings.map((booking) => { const canCancel = booking.status === 'confirmed' && booking.paymentStatus !== 'paid' && new Date(booking.startAt) > new Date(); return <article key={booking.id} className="rounded-2xl border border-[#e1e8e4] bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{booking.location?.name ?? 'Parking location'}</h2><span className="rounded-full bg-[#edf4ef] px-2.5 py-1 text-[11px] font-semibold capitalize text-emerald-900">{booking.status}</span><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold capitalize text-amber-900">{(booking.paymentStatus ?? 'pending').replaceAll('_',' ')}</span></div><p className="mt-1 text-sm text-[#60736e]">Space {booking.slot?.slotNumber ?? '—'} · {booking.slot ? vehicleNames[booking.slot.vehicleType] : 'Parking'}</p><p className="mt-2 text-sm text-[#73847e]">{new Date(booking.startAt).toLocaleString()} – {new Date(booking.endAt).toLocaleTimeString()}</p></div><div className="flex items-center gap-3"><span className="font-semibold">{money(booking.amountPaise)}</span>{booking.paymentStatus !== 'paid' && booking.status === 'confirmed' && <button className="rounded-full bg-emerald-800 px-4 py-2 text-sm font-semibold text-white" onClick={() => pay(booking)}>Pay securely</button>}{canCancel && <button className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50" onClick={() => window.confirm('Cancel this reservation?') && cancel(booking)}>Cancel</button>}</div></div>{booking.paymentStatus === 'paid' && booking.accessState !== 'exited' && <BookingTicket booking={booking}/ >}{booking.entryAt && <p className="mt-3 text-xs text-[#60736e]">Entry recorded {new Date(booking.entryAt).toLocaleString()}{booking.exitAt ? ` · Exit recorded ${new Date(booking.exitAt).toLocaleString()}` : ''}</p>}</article>; })}</div> : <StateMessage kind="empty">You don't have any bookings yet. Find a space when you're ready for your next stop.</StateMessage>}</main></div>;
}

export function CustomerParkingHistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'customer') { setLoading(false); return; }
    apiRequest('/bookings').then((result) => setBookings(result.bookings)).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [authLoading, user]);
  if (authLoading) return <div className="min-h-screen bg-[#f6f8f7]"><ParkingNav/><main className="mx-auto max-w-5xl p-8"><StateMessage>Loading your secure session…</StateMessage></main></div>;
  if (!user || user.role !== 'customer') return <><ParkingNav/><AuthShell title="Sign in to view parking history" subtitle="Your past parking activity is private to your account."><a href="/login" className="block rounded-xl bg-[#064e3b] px-5 py-3 text-center text-sm font-bold text-white">Sign in</a></AuthShell></>;
  const history = bookings.filter((booking) => ['completed', 'cancelled'].includes(booking.status) || new Date(booking.endAt) < new Date());
  return <div className="min-h-screen bg-[#f6f8f7]"><ParkingNav/><main className="mx-auto max-w-5xl px-5 py-9 lg:px-10 lg:py-12">
    <PageHeader eyebrow="Your account" title="Parking history" detail="Completed, past, and cancelled parking reservations from your account." actions={<a href="/bookings" className="rounded-xl border border-[#dce7e0] bg-white px-4 py-2.5 text-sm font-semibold text-[#26483b]">Upcoming bookings</a>}/>
    {error ? <StateMessage kind="error">{error}</StateMessage> : loading ? <StateMessage>Loading your parking history…</StateMessage> : history.length ? <div className="space-y-3">{history.map((booking) => <article key={booking.id} className="rounded-2xl border border-[#e1e8e4] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold">{booking.location?.name ?? 'Parking location'}</h2><span className="status-pill" data-status={booking.status}>{booking.status}</span></div><p className="mt-1 text-sm text-[#60736e]">Space {booking.slot?.slotNumber ?? '—'} · {new Date(booking.startAt).toLocaleString()}</p><p className="mt-1 text-xs text-[#73847e]">{new Date(booking.startAt).toLocaleString()} – {new Date(booking.endAt).toLocaleString()}</p></div><div className="text-right"><p className="font-semibold">{money(booking.amountPaise)}</p><p className="mt-1 text-xs capitalize text-[#60736e]">Payment: {(booking.paymentStatus ?? 'pending').replaceAll('_', ' ')}</p></div></div></article>)}</div> : <StateMessage kind="empty">No past parking reservations to show yet.</StateMessage>}
  </main></div>;
}

export function CustomerDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [payments, setPayments] = useState([]);
  const [inventory, setInventory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'customer') { setLoading(false); return; }
    let current = true;
    setLoading(true);
    Promise.all([apiRequest('/bookings'), apiRequest('/payments/history'), apiRequest('/locations?limit=50')])
      .then(async ([bookingResult, paymentResult, firstPage]) => {
        const pageCount = Math.ceil(firstPage.total / firstPage.limit);
        const remainingPages = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => apiRequest(`/locations?page=${index + 2}&limit=50`)));
        const locations = [firstPage, ...remainingPages].flatMap((page) => page.locations);
        if (current) {
          setBookings(bookingResult.bookings);
          setPayments(paymentResult.payments);
          setInventory({
            total: locations.reduce((sum, location) => sum + (location.totalSlots ?? 0), 0),
            available: locations.reduce((sum, location) => sum + (location.availableSlots ?? 0), 0),
            occupied: locations.every((location) => Number.isFinite(location.occupiedSlots))
              ? locations.reduce((sum, location) => sum + location.occupiedSlots, 0)
              : null,
          });
        }
      })
      .catch((e) => { if (current) setError(e.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [authLoading, user]);
  if (authLoading) return <div className="min-h-screen bg-[#f6f8f7]"><ParkingNav/><main className="mx-auto max-w-7xl p-8"><StateMessage>Loading your secure session…</StateMessage></main></div>;
  if (!user || user.role !== 'customer') return <><ParkingNav/><AuthShell title="Sign in to view your dashboard" subtitle="Your bookings and parking activity are private to your account."><a href="/login" className="block rounded-xl bg-[#064e3b] px-5 py-3 text-center text-sm font-bold text-white">Sign in</a></AuthShell></>;
  const now = Date.now();
  const upcoming = bookings.filter((booking) => booking.status === 'confirmed' && new Date(booking.startAt).getTime() > now).length;
  const active = bookings.filter((booking) => booking.accessState === 'entered' && !booking.exitAt).length;
  const spent = payments.filter((payment) => payment.status === 'captured').reduce((sum, payment) => sum + payment.amountPaise, 0);
  const metrics = [
    { label: 'Total slots', value: inventory?.total ?? '—', sub: 'Across active parking locations', icon: '▦', tone: 'mint' },
    { label: 'Available slots', value: inventory?.available ?? '—', sub: 'For the current availability window', icon: '✓', tone: 'mint' },
    { label: 'Occupied slots', value: inventory?.occupied ?? '—', sub: inventory?.occupied === null ? 'Occupancy is not reported by the API' : 'Confirmed occupied inventory', icon: '◉', tone: 'gold' },
    { label: 'My active bookings', value: active, sub: 'Entry recorded · awaiting exit', icon: '↗', tone: 'blue' },
    { label: 'Total bookings', value: bookings.length, sub: 'Latest 100 bookings', icon: '▤', tone: 'mint' },
    { label: 'Upcoming bookings', value: upcoming, sub: 'Confirmed future reservations', icon: '◷', tone: 'gold' },
    { label: 'Total spending', value: money(spent), sub: 'Captured payments in recent history', icon: '₹', tone: 'mint' },
  ];
  return <div className="min-h-screen bg-[#f6f8f7]"><ParkingNav/><main className="mx-auto max-w-7xl px-5 py-9 lg:px-10 lg:py-12">
    <PageHeader eyebrow="Your Smart Parking" title={`Good to see you, ${user.name.split(' ')[0]}.`} detail="A clear view of your upcoming parking and recent activity." actions={<div className="flex gap-2"><a href="/payments" className="rounded-xl border border-[#dce7e0] bg-white px-4 py-2.5 text-sm font-semibold text-[#26483b] transition hover:bg-[#f2f7f3]">Payment history</a><a href="/parking" className="rounded-xl bg-[#064e3b] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#043c2e]">Find parking</a></div>}/>
    {error && <div className="mb-5"><StateMessage kind="error">{error}</StateMessage></div>}
    {loading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <div key={metric.label} className="h-32 animate-pulse rounded-2xl bg-white"/> )}</div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <article key={metric.label} className="rounded-2xl border border-[#e5ece7] bg-white p-5 shadow-[0_10px_35px_-30px_rgba(6,78,59,.55)] transition hover:-translate-y-0.5 hover:shadow-lg"><div className="flex items-start justify-between"><span className="text-sm font-medium text-[#64756e]">{metric.label}</span><span className={`grid size-10 place-items-center rounded-xl text-lg ${metric.tone === 'gold' ? 'bg-amber-50 text-amber-700' : metric.tone === 'blue' ? 'bg-sky-50 text-sky-700' : 'bg-[#e8f3ec] text-[#064e3b]'}`}>{metric.icon}</span></div><p className="mt-4 text-3xl font-semibold tracking-tight text-[#17392f]">{metric.value}</p><p className="mt-1 text-xs text-[#879690]">{metric.sub}</p></article>)}</div>}
    <section className="mt-9 overflow-hidden rounded-[1.5rem] border border-[#e5ece7] bg-white shadow-sm"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#edf1ee] px-5 py-5 sm:px-6"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-emerald-800">Recent activity</p><h2 className="mt-1 text-xl font-semibold">Booking history</h2><p className="mt-1 text-xs text-[#879690]">Summary based on the latest 100 bookings and payment attempts returned by Smart Parking.</p></div><a href="/bookings" className="text-sm font-bold text-[#064e3b] hover:underline">All bookings →</a></div>
      {loading ? <div className="space-y-3 p-5">{Array.from({ length: 4 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-[#f1f5f2]"/>)}</div> : bookings.length ? <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-left"><thead><tr className="bg-[#f8faf8] text-[11px] font-bold uppercase tracking-wider text-[#73847e]"><th className="px-6 py-3">Location / slot</th><th className="px-6 py-3">Arrival</th><th className="px-6 py-3">Amount</th><th className="px-6 py-3">Booking</th><th className="px-6 py-3">Payment</th><th className="px-6 py-3">Access</th></tr></thead><tbody>{bookings.slice(0, 8).map((booking) => <tr key={booking.id} className="border-t border-[#edf1ee] text-sm transition hover:bg-[#fbfdfb]"><td className="px-6 py-4"><p className="font-semibold text-[#17392f]">{booking.location?.name ?? 'Parking location'}</p><p className="mt-0.5 text-xs text-[#879690]">{booking.slot?.slotNumber ? `Space ${booking.slot.slotNumber}` : 'Space details unavailable'}</p></td><td className="px-6 py-4 text-[#53675e]">{new Date(booking.startAt).toLocaleString()}</td><td className="px-6 py-4 font-semibold">{money(booking.amountPaise)}</td><td className="px-6 py-4"><span className="status-pill" data-status={booking.status}>{booking.status}</span></td><td className="px-6 py-4"><span className="status-pill" data-status={booking.paymentStatus ?? 'pending'}>{(booking.paymentStatus ?? 'pending').replaceAll('_', ' ')}</span></td><td className="px-6 py-4 capitalize text-[#53675e]">{(booking.accessState ?? 'not_entered').replaceAll('_', ' ')}</td></tr>)}</tbody></table></div> : <div className="p-8"><StateMessage kind="empty">No bookings yet. Choose a location to plan your first stop.</StateMessage><a href="/parking" className="mt-4 inline-flex rounded-xl bg-[#064e3b] px-4 py-2.5 text-sm font-bold text-white">Find your first space</a></div>}
    </section>
    <p className="mt-3 text-xs text-[#879690]">Dashboard totals use the latest 100 records provided by the existing API. Historical totals beyond that API limit are not available here.</p>
  </main></div>;
}
