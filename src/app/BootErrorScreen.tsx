/**
 * Boot-error screen (ARCHITECTURE.md §6). Rendered instead of <App> when
 * loadGameData throws DataValidationError. Ugly is fine, complete is mandatory:
 * every problem collected during validation must be listed.
 */
export default function BootErrorScreen({ problems }: { problems: string[] }) {
  return (
    <div className="boot-error">
      <h1>Game data failed to load</h1>
      <p>
        {problems.length} problem{problems.length === 1 ? '' : 's'} found in the vendored
        JSON. Fix the data and reload — the app refuses to start with invalid data.
      </p>
      <ul>
        {problems.map((problem, i) => (
          <li key={i}>{problem}</li>
        ))}
      </ul>
    </div>
  );
}
