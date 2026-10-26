// The Shared To-Do emblem: a speech bubble (sharing and comments) holding a tick
// made of two people leaning together, one task finished by more than one person.
export default function Emblem({ size = 32, title = 'Shared To-Do' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title} className="emblem">
      <path
        d="M20 5h24a15 15 0 0 1 15 15v17a15 15 0 0 1-15 15H27l-13 8.5 2.4-10A15 15 0 0 1 5 37V20A15 15 0 0 1 20 5z"
        fill="#0f6b5f"
      />
      <path d="M19 30.5l9.5 9.5" stroke="#8fe3d3" strokeWidth="6.5" strokeLinecap="round" />
      <path d="M28.5 40L45 23.5" stroke="#fff" strokeWidth="6.5" strokeLinecap="round" />
      <circle cx="14.6" cy="24.6" r="4" fill="#8fe3d3" />
      <circle cx="50.2" cy="17.4" r="4.2" fill="#fff" />
    </svg>
  );
}
