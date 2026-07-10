interface StartScreenProps {
  onStart: () => void;
}

/**
 * StartScreen (ROADMAP.md §7 Task 1). Pure presentation: frames the game and
 * fires onStart. Landing is UI state owned by App — deliberately NOT a
 * DraftSession phase (ROADMAP §10 guardrail).
 */
export default function StartScreen({ onStart }: StartScreenProps) {
  return (
    <div className="start-screen">
      <span className="eyebrow">World Cup Draft-XI</span>
      <h1>fifaTenZero</h1>
      <p className="start-blurb">
        Legendary World Cup squads, revealed one at a time. Take one player from each
        reveal, build your XI, and see what scoreline history hands you.
      </p>
      <ul className="start-rules">
        <li>11 rounds — one pick per revealed squad.</li>
        <li>One skip token: pass on a squad, once per draft. It costs a round.</li>
        <li>Your final XI decides the result. No dice — squad quality is destiny.</li>
      </ul>
      <button type="button" className="start-button" onClick={onStart}>
        Start Game
      </button>
    </div>
  );
}