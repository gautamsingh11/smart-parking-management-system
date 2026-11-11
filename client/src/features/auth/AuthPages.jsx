import { useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import AuthShell from './AuthShell.jsx';
import { apiRequest } from '../../lib/api.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordIsStrong = (password) => password.length >= 12 && new TextEncoder().encode(password).length <= 72;

function Field({ label, type = 'text', value, onChange, autoComplete, required = true, hint, error }) {
  return <label className="block text-sm font-medium text-[#243a34]">{label}
    <input className="auth-field mt-2" type={type} value={value} onChange={onChange} autoComplete={autoComplete} required={required} aria-invalid={Boolean(error)} />
    {hint && <span className="mt-1 block text-xs font-normal text-[#83928d]">{hint}</span>}
    {error && <span className="mt-1 block text-xs font-normal text-red-700">{error}</span>}
  </label>;
}

function FormError({ children }) {
  return children ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{children}</p> : null;
}

function SubmitButton({ children, busy }) {
  return <button className="w-full rounded-full bg-emerald-800 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-60" disabled={busy}>{busy ? 'Please wait…' : children}</button>;
}

export function LoginPage() {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault(); setError('');
    if (!emailPattern.test(email)) return setError('Enter a valid email address.');
    setBusy(true);
    try { await auth.login(email, password); window.location.assign('/profile'); }
    catch (submitError) { setError(submitError.message); }
    finally { setBusy(false); }
  }

  return <AuthShell title="Welcome back" subtitle="Sign in to manage your parking plans.">
    <form className="space-y-5" onSubmit={submit}>
      <FormError>{error}</FormError>
      <Field label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
      <Field label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
      <div className="-mt-2 text-right"><a className="text-sm font-medium text-emerald-800 hover:underline" href="/forgot-password">Forgot password?</a></div>
      <SubmitButton busy={busy}>Sign in</SubmitButton>
      <p className="text-center text-sm text-[#60736e]">New to Smart Parking? <a className="font-semibold text-emerald-800 hover:underline" href="/register">Create an account</a></p>
    </form>
  </AuthShell>;
}

export function RegisterPage() {
  const auth = useAuth();
  const [values, setValues] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (key) => (event) => setValues({ ...values, [key]: event.target.value });

  async function submit(event) {
    event.preventDefault(); setError('');
    if (!emailPattern.test(values.email)) return setError('Enter a valid email address.');
    if (!passwordIsStrong(values.password)) return setError('Use a password with at least 12 characters and no more than 72 bytes.');
    setBusy(true);
    try { await auth.register(values); window.location.assign('/profile'); }
    catch (submitError) { setError(submitError.message); }
    finally { setBusy(false); }
  }

  return <AuthShell title="Create your account" subtitle="Get started with a smoother parking experience.">
    <form className="space-y-4" onSubmit={submit}>
      <FormError>{error}</FormError>
      <Field label="Full name" value={values.name} onChange={update('name')} autoComplete="name" />
      <Field label="Email address" type="email" value={values.email} onChange={update('email')} autoComplete="email" />
      <Field label="Phone (optional)" type="tel" value={values.phone} onChange={update('phone')} autoComplete="tel" required={false} />
      <Field label="Password" type="password" value={values.password} onChange={update('password')} autoComplete="new-password" hint="Use at least 12 characters. A longer passphrase works well." />
      <SubmitButton busy={busy}>Create customer account</SubmitButton>
      <p className="text-center text-sm text-[#60736e]">Already have an account? <a className="font-semibold text-emerald-800 hover:underline" href="/login">Sign in</a></p>
    </form>
  </AuthShell>;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (!emailPattern.test(email)) return setError('Enter a valid email address.');
    setBusy(true);
    try { const result = await apiRequest('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }); setMessage(result.message); }
    catch (submitError) { setError(submitError.message); }
    finally { setBusy(false); }
  }
  return <AuthShell title="Reset your password" subtitle="Enter your email and we’ll send a secure reset link if an account matches.">
    <form className="space-y-5" onSubmit={submit}><FormError>{error}</FormError>{message && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</p>}<Field label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /><SubmitButton busy={busy}>Send reset link</SubmitButton><p className="text-center text-sm"><a className="font-semibold text-emerald-800 hover:underline" href="/login">Back to sign in</a></p></form>
  </AuthShell>;
}

export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (!passwordIsStrong(password)) return setError('Use a password with at least 12 characters and no more than 72 bytes.');
    if (password !== confirmation) return setError('The passwords do not match.');
    if (!token) return setError('This reset link is missing its token. Request a new link.');
    setBusy(true);
    try { const result = await apiRequest('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, password }) }); setMessage(result.message); }
    catch (submitError) { setError(submitError.message); }
    finally { setBusy(false); }
  }
  return <AuthShell title="Choose a new password" subtitle="Your reset link is single-use and expires after a short time.">
    <form className="space-y-5" onSubmit={submit}><FormError>{error}</FormError>{message && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message} <a className="font-semibold underline" href="/login">Sign in</a></p>}<Field label="New password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /><Field label="Confirm password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" /><SubmitButton busy={busy}>Reset password</SubmitButton></form>
  </AuthShell>;
}

export function ProfilePage() {
  const auth = useAuth();
  const [name, setName] = useState(auth.user?.name ?? '');
  const [phone, setPhone] = useState(auth.user?.phone ?? '');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try { const result = await apiRequest('/auth/me', { method: 'PATCH', body: JSON.stringify({ name, phone }) }); auth.updateUser(result.user); setNotice('Your profile was updated.'); }
    catch (submitError) { setError(submitError.message); }
    finally { setBusy(false); }
  }
  if (auth.loading) return <div className="p-10 text-center text-[#60736e]">Checking your secure session…</div>;
  if (!auth.user) return <AuthShell title="Sign in to continue" subtitle="Your profile is available after you sign in."><a className="block rounded-full bg-emerald-800 px-5 py-3 text-center text-sm font-semibold text-white" href="/login">Go to sign in</a></AuthShell>;
  return <AuthShell title="Your profile" subtitle={`Signed in as ${auth.user.email} · ${auth.user.role.replace('_', ' ')}`}>
    <form className="space-y-5" onSubmit={submit}><FormError>{error}</FormError>{notice && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>}<Field label="Full name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /><Field label="Phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" required={false} /><SubmitButton busy={busy}>Save changes</SubmitButton><button type="button" className="w-full rounded-full border border-[#dce5e1] px-5 py-3 text-sm font-semibold text-[#38534b]" onClick={async () => { try { await auth.logout(); window.location.assign('/'); } catch (logoutError) { setError(logoutError.message); } }}>Sign out</button></form>
  </AuthShell>;
}
