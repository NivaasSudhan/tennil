import type { OppositionDef } from '../domain/scoring/profileFit';

interface OpponentCardProps {
  opposition: OppositionDef;
  onContinue: () => void;
}

export default function OpponentCard({ opposition, onContinue }: OpponentCardProps) {
  return (
    <div className="opponent-card">
      <div className="opponent-card__inner">
        <div className="opponent-card__grain" />
        <span className="eyebrow opponent-card__eyebrow">Your Opponent</span>
        <span className="opponent-card__label">{opposition.label}</span>
        <p className="opponent-card__tagline">{opposition.tagline}</p>
        <button
          type="button"
          className="opponent-card__btn"
          onClick={onContinue}
        >
          CHOOSE YOUR SHAPE
        </button>
      </div>
    </div>
  );
}
