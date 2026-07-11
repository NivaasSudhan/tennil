import type { ReactNode } from 'react';

interface StadiumButtonProps {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  variant?: 'floodlit' | 'ghost';
  className?: string;
  'aria-label'?: string;
}

/**
 * StadiumButton (DESIGN.md Components). Primary CTA rendered as floodlit
 * stadium signage: gold border, glow, Archivo headline weight. The `ghost`
 * variant is a typed/circled paper-world button used for secondary actions
 * (e.g. Skip). Presentation only — no rules logic.
 */
export default function StadiumButton({
  children,
  onClick,
  disabled = false,
  type = 'button',
  variant = 'floodlit',
  className,
  'aria-label': ariaLabel,
}: StadiumButtonProps) {
  const classes = ['stadium-button'];
  if (variant === 'ghost') classes.push('stadium-button--ghost');
  if (className) classes.push(className);

  return (
    <button
      type={type}
      className={classes.join(' ')}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      <span className="stadium-button__label">{children}</span>
    </button>
  );
}