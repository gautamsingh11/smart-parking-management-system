import BrandLogo from '../../components/BrandLogo.jsx';

export default function AuthShell({ eyebrow = 'WELCOME TO SMART PARKING', title, subtitle, children }) {
  return (
    <main className="min-h-screen bg-[#f6f8f7] px-5 py-8 text-[#14221f] sm:py-12">
      <BrandLogo />
      <section className="mx-auto mt-10 w-full max-w-md rounded-3xl border border-[#e1e8e4] bg-white p-7 shadow-sm sm:mt-14 sm:p-9">
        <p className="text-xs font-semibold tracking-[0.15em] text-emerald-800">{eyebrow}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-[#60736e]">{subtitle}</p>
        <div className="mt-7">{children}</div>
      </section>
      <p className="mx-auto mt-7 max-w-md text-center text-xs leading-5 text-[#879690]">Your account is protected with encrypted password storage and secure sign-in sessions.</p>
    </main>
  );
}
