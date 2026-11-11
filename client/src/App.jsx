import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './features/auth/AuthContext.jsx';
import { ForgotPasswordPage, LoginPage, ProfilePage, RegisterPage, ResetPasswordPage } from './features/auth/AuthPages.jsx';
import { CustomerBookingsPage, CustomerDashboardPage, CustomerParkingHistoryPage, OwnerDashboardPage, ParkingDetailsPage, ParkingSearchPage } from './features/parking/ParkingPages.jsx';
import { AccessScannerRoute, PaymentHistoryPage, PaymentResultPage, ReceiptPage } from './features/access/AccessPages.jsx';
import BrandLogo from './components/BrandLogo.jsx';
import { apiRequest } from './lib/api.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api';
const SOCKET_ORIGIN = new URL(API_BASE_URL, window.location.origin).origin;
const DEMO_SLOTS = [
  { id: 'demo-a01', slotNumber: 'A01', status: 'active', available: true },
  { id: 'demo-a02', slotNumber: 'A02', status: 'occupied', available: false },
  { id: 'demo-a03', slotNumber: 'A03', status: 'active', available: true },
  { id: 'demo-a04', slotNumber: 'A04', status: 'active', available: true },
  { id: 'demo-a05', slotNumber: 'A05', status: 'active', available: false },
  { id: 'demo-b01', slotNumber: 'B01', status: 'active', available: true },
  { id: 'demo-b02', slotNumber: 'B02', status: 'maintenance', available: false },
  { id: 'demo-b03', slotNumber: 'B03', status: 'active', available: false },
  { id: 'demo-b04', slotNumber: 'B04', status: 'active', available: true },
  { id: 'demo-b05', slotNumber: 'B05', status: 'active', available: true },
];

function HeroParkingLot() {
  const [slots, setSlots] = useState([]);
  const [location, setLocation] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    try {
      const locations = await apiRequest('/locations?limit=1');
      const first = locations.locations[0];
      if (!first) { setLocation(null); setSlots(DEMO_SLOTS); setDemo(true); return; }
      setLocation(first);
      const availability = await apiRequest(`/locations/${first.id}/availability`);
      const liveSlots = availability.slots.slice(0, 10);
      setSlots(liveSlots.length ? liveSlots : DEMO_SLOTS);
      setDemo(liveSlots.length === 0);
      setSelectedId((current) => liveSlots.some((slot) => slot.id === current && slot.status === 'active' && slot.available) ? current : '');
    } catch {
      setLocation(null);
      setSlots(DEMO_SLOTS);
      setDemo(true);
    }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!location?.id) return undefined;
    const socket = io(SOCKET_ORIGIN, { path: '/api/v1/socket.io', withCredentials: true, reconnectionAttempts: 2 });
    socket.on('connect', () => socket.emit('availability:subscribe', { locationId: location.id }));
    socket.on('availability:update', (event) => { if (event.locationId === location.id) load(); });
    return () => { socket.emit('availability:unsubscribe', { locationId: location.id }); socket.disconnect(); };
  }, [location?.id]);
  const selected = slots.find((slot) => slot.id === selectedId);
  const label = (slot) => slot.status === 'occupied' ? 'Occupied' : slot.status === 'maintenance' || !slot.available ? 'Unavailable' : 'Available';
  const color = (slot) => slot.status === 'occupied' ? 'occupied' : slot.status === 'maintenance' || !slot.available ? 'unavailable' : 'available';
  const canSelect = (slot) => slot.status === 'active' && slot.available;
  return <section className="relative w-full rounded-[1.65rem] border border-[#e1ebe4] bg-white p-4 text-[#14221f] shadow-[0_26px_70px_-38px_rgba(6,78,59,.35)] sm:p-5" aria-label="Live parking availability preview">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#087653]">Parking spaces</p><h2 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">{location?.name ?? 'Parking lot preview'}</h2></div><span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold ${demo ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}><i className={`size-2 rounded-full ${demo ? 'bg-amber-500' : 'animate-availability bg-emerald-500'}`}/>{demo ? 'Demo preview' : 'Live availability'}</span></div>
    {loading ? <div className="mt-4 grid min-h-44 place-items-center rounded-2xl bg-[#f3f7f4] text-sm text-[#73847e]" role="status">Loading parking spaces…</div> : <>
      <div className="parking-preview mt-4 rounded-2xl border border-[#dce5de] p-3 sm:p-4"><div className="mb-3 flex items-center justify-center gap-2 text-[9px] font-bold uppercase tracking-[.2em] text-[#718179]"><span className="h-px w-7 bg-[#cad7cf]"/>Entry / drive aisle<span className="h-px w-7 bg-[#cad7cf]"/></div>
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2">{slots.map((slot) => <button type="button" key={slot.id} onClick={() => canSelect(slot) && setSelectedId(slot.id)} disabled={!canSelect(slot)} aria-pressed={selectedId === slot.id} title={`${slot.slotNumber} · ${label(slot)}`} className={`hero-parking-slot ${selectedId === slot.id ? 'is-selected' : `is-${color(slot)}`} ${canSelect(slot) ? 'cursor-pointer' : 'cursor-not-allowed'}`}><span className="block truncate text-center text-[9px] font-extrabold sm:text-xs">{slot.slotNumber}</span><svg aria-hidden="true" viewBox="0 0 40 27" className="mx-auto my-1 h-5 w-7 sm:h-7 sm:w-9"><path d="m7 18 2-7a4 4 0 0 1 4-3h14a4 4 0 0 1 4 3l2 7v6h-4v-3H11v3H7v-6Z" fill="currentColor" opacity=".18" stroke="currentColor" strokeWidth="1.6"/><path d="M11 16h18M12 21h.1M28 21h.1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg><span className="block truncate text-center text-[8px] font-bold uppercase tracking-tight sm:text-[9px]">{selectedId === slot.id ? 'Selected' : label(slot)}</span></button>)}</div>
        <div className="parking-drive-lane my-3 flex items-center justify-center gap-8 rounded-lg py-2 text-[9px] font-bold uppercase tracking-[.22em] text-white/90"><span>←</span><span>Drive aisle</span><span>→</span></div>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[9px] font-semibold text-[#60736e]">{[['available','Available'],['occupied','Occupied'],['unavailable','Unavailable']].map(([tone, text]) => <span key={tone} className="inline-flex items-center gap-1.5"><i className={`hero-legend-dot is-${tone}`}/>{text}</span>)}</div>
      </div>
      <div className="mt-3 min-h-10 rounded-xl border border-[#e5ece7] bg-[#f9fbf9] px-3 py-2.5 text-center" aria-live="polite">{selected ? <p className="text-xs font-semibold text-[#17392f]">{selected.slotNumber} · {label(selected)}</p> : <p className="text-xs text-[#718179]">Choose an available space to see its status.</p>}</div>
      {demo && <p className="mt-2 text-center text-[10px] font-semibold text-amber-900">Demo preview only · slot status is illustrative, not live availability.</p>}
    </>}
  </section>;
}

const features = [
  { icon: '⌖', title: 'Find a better spot', copy: 'Compare real locations, hourly rates, and availability for your arrival window.' },
  { icon: '◷', title: 'Book on your schedule', copy: 'Choose your vehicle, arrival, and departure, with clear pricing before you confirm.' },
  { icon: '↗', title: 'Arrive with confidence', copy: 'Keep your booking and secure access pass close at hand, from entry to exit.' },
];

function HomePage() {
  const { user, loading, logout } = useAuth();
  return (
    <main className="min-h-screen overflow-hidden bg-[#fbfcfb] text-[#14221f]">
      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
        <BrandLogo />
        <div className="hidden items-center gap-8 text-sm font-medium text-[#50645c] md:flex"><a className="transition hover:text-[#064e3b]" href="/parking">Find parking</a><a className="transition hover:text-[#064e3b]" href="#how-it-works">How it works</a>{user?.role === 'customer' && <><a href="/bookings" className="transition hover:text-[#064e3b]">My bookings</a><a href="/history" className="transition hover:text-[#064e3b]">Parking history</a></>}{['parking_owner','admin'].includes(user?.role) && <a href="/owner" className="transition hover:text-[#064e3b]">Owner dashboard</a>}</div>
        <div className="flex items-center gap-2">{loading ? <span className="hidden text-xs text-[#73847e] sm:block">Checking session…</span> : user ? <><a className="hidden rounded-full px-3 py-2 text-sm font-semibold text-[#064e3b] transition hover:bg-emerald-50 sm:inline" href="/profile">{user.name}</a><button className="rounded-full px-3 py-2 text-sm font-semibold text-[#50645c] transition hover:bg-slate-100" onClick={() => logout().then(() => window.location.assign('/'))}>Sign out</button></> : <><a className="rounded-full px-3 py-2 text-sm font-semibold text-[#064e3b] transition hover:bg-emerald-50" href="/login">Sign in</a><a className="rounded-full bg-[#064e3b] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#043c2e]" href="/register">Get started <span aria-hidden="true">↗</span></a></>}</div>
      </nav>
      <div className="mx-auto flex max-w-7xl gap-5 px-5 pb-2 text-xs font-semibold text-[#50645c] md:hidden sm:px-8"><a href="/parking" className="hover:text-[#064e3b]">Find Parking</a>{user?.role === 'customer' && <><a href="/bookings" className="hover:text-[#064e3b]">My Bookings</a><a href="/dashboard" className="hover:text-[#064e3b]">Dashboard</a></>}{['parking_owner','admin'].includes(user?.role) && <a href="/owner" className="hover:text-[#064e3b]">Dashboard</a>}</div>

      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[1.03fr_.97fr] lg:px-10 lg:pb-24 lg:pt-16">
        <div className="animate-rise">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[.13em] text-[#064e3b]"><span className="size-2 rounded-full bg-emerald-500"/> A calmer way to park</p>
          <h1 className="max-w-2xl text-[2.7rem] font-semibold leading-[1.06] tracking-[-.055em] sm:text-6xl lg:text-[4.25rem]">Find Your Spot. <span className="text-[#087653]">Park with Confidence.</span></h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-[#64756e] sm:text-lg sm:leading-8">Discover available parking spaces in real time, compare prices, and reserve your spot in seconds.</p>
          <div className="mt-8 flex flex-wrap gap-3"><a href="/parking" className="inline-flex items-center gap-2 rounded-xl bg-[#064e3b] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-950/10 transition hover:-translate-y-0.5 hover:bg-[#043c2e]">Explore parking <span aria-hidden="true">→</span></a><a href={user ? '/profile' : '/register'} className="rounded-xl border border-[#dce5e1] bg-white px-5 py-3.5 text-sm font-bold text-[#26483b] transition hover:border-emerald-200 hover:bg-emerald-50">{user ? 'Your account' : 'Create an account'}</a></div>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 border-t border-[#e5ece7] pt-6 text-sm text-[#62756c]"><span className="inline-flex items-center gap-2"><b className="text-[#087653]">✓</b> Live availability</span><span className="inline-flex items-center gap-2"><b className="text-[#087653]">✓</b> Clear hourly prices</span><span className="inline-flex items-center gap-2"><b className="text-[#087653]">✓</b> Secure access tickets</span></div>
        </div>
        <div className="animate-rise animation-delay-150"><HeroParkingLot /></div>
      </section>

      <section id="how-it-works" className="border-t border-[#e8eeea] bg-white"><div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20"><div className="mb-9 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.17em] text-[#087653]">Simple by design</p><h2 className="mt-3 text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Your space, sorted.</h2></div><a href="/parking" className="text-sm font-bold text-[#064e3b] transition hover:translate-x-1">Find parking <span aria-hidden="true">→</span></a></div><div className="grid gap-4 md:grid-cols-3">{features.map((feature, index) => <article key={feature.title} className="feature-card rounded-2xl border border-[#e8eeea] bg-[#fcfdfc] p-6 transition duration-300 hover:-translate-y-1 hover:border-emerald-200 hover:bg-white hover:shadow-xl hover:shadow-emerald-950/5"><div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-xl bg-[#e8f3ec] text-xl text-[#064e3b]">{feature.icon}</span><span className="text-xs font-bold tracking-widest text-[#9aaba4]">0{index + 1}</span></div><h3 className="mt-6 text-lg font-semibold">{feature.title}</h3><p className="mt-2 leading-6 text-[#64756e]">{feature.copy}</p></article>)}</div><div className="mt-10 flex flex-col items-start justify-between gap-5 rounded-3xl bg-[#f0f6f2] p-6 sm:flex-row sm:items-center sm:p-8"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#087653]">For parking operators</p><h3 className="mt-2 text-xl font-semibold">Bring your parking online.</h3><p className="mt-1 text-sm text-[#64756e]">Manage your locations, inventory, and upcoming bookings.</p></div><a href={user ? '/owner' : '/login'} className="rounded-xl border border-[#d3e2d8] bg-white px-5 py-3 text-sm font-bold text-[#064e3b] shadow-sm transition hover:border-[#064e3b]">{user?.role === 'parking_owner' || user?.role === 'admin' ? 'Open dashboard' : 'Operator sign in'} <span aria-hidden="true">↗</span></a></div></div></section>
      <footer className="bg-[#063d30] text-white"><div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10"><BrandLogo inverse/><p className="text-emerald-100/70">Thoughtful parking for the way you move.</p><div className="flex gap-5 text-emerald-100/80"><a className="transition hover:text-white" href="/parking">Find parking</a>{user?.role === 'customer' && <a className="transition hover:text-white" href="/bookings">My bookings</a>}</div></div></footer>
    </main>
  );
}

export default function App() {
  const page = window.location.pathname;
  if (page === '/login') return <LoginPage />;
  if (page === '/register') return <RegisterPage />;
  if (page === '/forgot-password') return <ForgotPasswordPage />;
  if (page === '/reset-password') return <ResetPasswordPage />;
  if (page === '/profile') return <ProfilePage />;
  if (page === '/parking') return <ParkingSearchPage />;
  if (page === '/owner') return <OwnerDashboardPage />;
  if (page === '/bookings') return <CustomerBookingsPage />;
  if (page === '/history') return <CustomerParkingHistoryPage />;
  if (page === '/dashboard') return <CustomerDashboardPage />;
  if (page === '/access-scanner') return <AccessScannerRoute />;
  if (page === '/payments') return <PaymentHistoryPage />;
  if (page === '/payment-success') return <PaymentResultPage success />;
  if (page === '/payment-failure') return <PaymentResultPage success={false} />;
  const receipt = page.match(/^\/payments\/([a-f\d]{24})\/receipt$/i);
  if (receipt) return <ReceiptPage paymentId={receipt[1]} />;
  const parkingDetail = page.match(/^\/parking\/([a-f\d]{24})$/i);
  if (parkingDetail) return <ParkingDetailsPage locationId={parkingDetail[1]} />;
  return <HomePage />;
}
