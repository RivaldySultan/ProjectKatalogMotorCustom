import Link from './Link';

export default function Button({
  href,
  to,
  children,
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  ...rest
}) {
  const classes = [
    'rm-button',
    `rm-button--${variant}`,
    size === 'sm' ? 'rm-button--sm' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span>{children}</span>
      {icon ? (
        <span aria-hidden="true" className="rm-button__icon">
          {icon}
        </span>
      ) : null}
    </>
  );

  if (to) {
    return (
      <Link className={classes} to={to} {...rest}>
        {content}
      </Link>
    );
  }

  if (href) {
    return (
      <a className={classes} href={href} {...rest}>
        {content}
      </a>
    );
  }

  return (
    <button className={classes} type="button" {...rest}>
      {content}
    </button>
  );
}
