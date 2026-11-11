export default function BrandLogo({ compact = false, inverse = false, className = '' }) {
  return <a href="/" aria-label="Smart Parking home" className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-10 shrink-0 drop-shadow-sm">
      <path d="M24 3.5c-9.2 0-16.5 7.2-16.5 16.1C7.5 31.3 24 45 24 45s16.5-13.7 16.5-25.4C40.5 10.7 33.2 3.5 24 3.5Z" fill="#087653"/>
      <path d="M12.7 24.5h22.6v8.2H12.7z" fill="white"/>
      <path d="m15.3 24.5 2.1-6.1a3 3 0 0 1 2.8-2h7.6a3 3 0 0 1 2.8 2l2.1 6.1" fill="white" stroke="#087653" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="M22 19.2h6v4h-6z" fill="#087653"/><path d="M19 29h10v2.5H19z" fill="#087653"/>
      <circle cx="17" cy="30" r="1.4" fill="#087653"/><circle cx="31" cy="30" r="1.4" fill="#087653"/>
    </svg>
    {!compact && <span className={`text-xl ${inverse ? 'text-white' : 'text-[#123c30]'}`}>Smart <span className={inverse ? 'text-white' : 'text-[#087653]'}>Parking</span></span>}
  </a>;
}
