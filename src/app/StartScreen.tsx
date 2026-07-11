import StadiumButton from './StadiumButton';

interface StartScreenProps {
  onStart: () => void;
}

/**
 * StartScreen (DESIGN.md Theme/Components — night-stadium landing). Pure
 * presentation: an Anton masthead under floodlit signage, the matchday
 * framing + core rules, and a StadiumButton CTA firing onStart. Landing is
 * UI state owned by App — deliberately NOT a DraftSession phase (the gate
 * guardrail). No rules logic here.
 */
export default function StartScreen({ onStart }: StartScreenProps) {
  return (
    <div className="start-screen">
      <span className="start-screen__eyebrow">World Cup Draft-XI</span>
      <h1 className="start-screen__masthead">fifaTenZero</h1>
      <p className="start-screen__blurb">
        Legendary World Cup squads, revealed one at a time under the lights.
        Take one player from each reveal, lock an XI, and see what scoreline
        history hands you.
      </p>
      <ul className="start-rules">
        <li>11 rounds — one pick per revealed squad.</li>
        <li>One skip token: pass on a squad, once per draft. It costs a round.</li>
        <li>Your final XI decides the result. No dice — squad quality is destiny.</li>
      </ul>
      <StadiumButton onClick={onStart}>Kick off</StadiumButton>
    </div>
  );
}