const ICONS = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  'arrow-up-right': <path d="M7 17 17 7M8 7h9v9" />,
  'arrow-down': <path d="M12 5v14M6 13l6 6 6-6" />,
  'arrow-left': <path d="M19 12H5M11 6l-6 6 6 6" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  pause: (
    <>
      <path d="M9 5v14M15 5v14" />
    </>
  ),
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </>
  ),
};

export default function Icon({ name, size = 20, title, className = '' }) {
  const content = ICONS[name];

  if (!content) return null;

  return (
    <svg
      aria-hidden={title ? undefined : 'true'}
      className={className}
      fill="none"
      focusable="false"
      height={size}
      role={title ? 'img' : undefined}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
      width={size}
    >
      {title ? <title>{title}</title> : null}
      {content}
    </svg>
  );
}
