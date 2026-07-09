import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import BootErrorScreen from './app/BootErrorScreen';
import { loadGameData } from './domain/loadData';
import { DataValidationError } from './domain/types';

import squadsJson from './data/squads/squads.json';
import thresholdsJson from './data/config/thresholds.json';
import commentaryJson from './data/config/commentary.json';
import positionMapJson from './data/position-map.json';

/**
 * Boot (TASKS.md T-009; ARCHITECTURE.md §6). GameData is loaded and validated
 * exactly ONCE here. On DataValidationError, render the boot-error screen listing
 * every problem — never a blank page, never a silent partial draft.
 */
const root = ReactDOM.createRoot(document.getElementById('root')!);

try {
  const data = loadGameData({
    squads: squadsJson,
    thresholds: thresholdsJson,
    commentary: commentaryJson,
    positionMap: positionMapJson,
  });

  root.render(
    <React.StrictMode>
      <App data={data} />
    </React.StrictMode>,
  );
} catch (err) {
  const problems = err instanceof DataValidationError ? err.problems : [String(err)];

  root.render(
    <React.StrictMode>
      <BootErrorScreen problems={problems} />
    </React.StrictMode>,
  );
}
