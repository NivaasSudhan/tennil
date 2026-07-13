import { useEffect, useRef, useCallback } from 'react';
import type { OppositionDef } from '../domain/scoring/profileFit';
import { getRulesPages } from './rulesCopy';

interface RulesProgrammeProps {
  open: boolean;
  onClose: () => void;
  opposition?: OppositionDef;
}

export default function RulesProgramme({ open, onClose, opposition }: RulesProgrammeProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (el && !el.open) {
      el.showModal();
    }
  }, [open]);

  const handleBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === dialogRef.current) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  const pages = getRulesPages(opposition);

  return (
    <dialog
      ref={dialogRef}
      className="rules-programme"
      aria-labelledby="rules-programme-heading"
      onClose={onClose}
      onClick={handleBackdrop}
    >
      <div className="rules-programme__spread">
        <div className="rules-programme__header">
          <h1 id="rules-programme-heading" className="rules-programme__masthead">
            Matchday Programme
          </h1>
          <button
            type="button"
            className="rules-programme__close"
            onClick={onClose}
            autoFocus
            aria-label="Close programme"
          >
            CLOSE
          </button>
        </div>

        <div className="rules-programme__pages">
          {pages.map((page) => (
            <article key={page.id} className="rules-programme__page">
              <h2 className="rules-programme__page-title">{page.title}</h2>
              {page.paragraphs.map((para, i) => (
                <p key={i} className="rules-programme__para">
                  {para}
                </p>
              ))}
            </article>
          ))}
        </div>
      </div>
    </dialog>
  );
}
