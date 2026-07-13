import type { OppositionDef, AttrName } from '../domain/scoring/profileFit';

export interface RulesPage {
  id: string;
  title: string;
  paragraphs: string[];
}

const PAGE_HOW_IT_WORKS: RulesPage = {
  id: 'how-it-works',
  title: 'How it works',
  paragraphs: [
    'Eleven rounds, eleven reveals. Each round another World Cup squad walks into the floodlights — you take one player or you pass. One skip token, one draft: use it on a squad that does not fit your plan. Skip costs you a round — eleven picks become ten, every slot still counts.',
    'No one plays twice. The same face across different eras? The rules remember. Once a player is in your XI, every version of them vanishes from the rest of the draft.',
  ],
};

const PAGE_YOUR_TARGET: RulesPage = {
  id: 'your-target',
  title: 'Your target',
  paragraphs: [
    'The formation you choose before kickoff sets the shape your XI is scored against. Each position bucket — defence, midfield, attack — has a minimum count: fill that many slots or that bucket cannot qualify for the highest result bands.',
    'You can still pick anyone you like. The formation is a target, not a cage. It tells you what the scoreline needs — you decide who delivers.',
  ],
};

const PAGE_HOW_YOURE_JUDGED: RulesPage = {
  id: 'how-youre-judged',
  title: 'How you are judged',
  paragraphs: [
    'Your final scoreline is scored against the best XI your reveals allowed — you can always win the hand you are dealt. The result is squad quality alone: no dice, no random sim.',
    'Your weakest player matters more than your star. One hole in the lineup drags the whole outcome. The near-miss line at full time tells you exactly what one more draft could fix — a sharper finisher, a steadier defender, a playmaker who reads the game.',
    'There are no perfect drafts. Only better ones.',
  ],
};

function opponentDescription(weightMods: Partial<Record<AttrName, number>>): string {
  const weighted = (Object.entries(weightMods) as [AttrName, number][])
    .filter(([, v]) => v > 1)
    .map(([k]) => k);

  if (weighted.length === 0) return 'A fair fight today. No tricks, no gimmicks — just eleven players against eleven.';

  const lines: string[] = [];
  for (const attr of weighted) {
    switch (attr) {
      case 'pace':
        lines.push('They suffocate space, hunt in packs, and punish anyone who cannot turn on the ball. Pace is the currency they demand — your fastest runners earn their keep today.');
        break;
      case 'strength':
        lines.push('They are physical, direct, and they impose themselves on every duel. Strength wins the fight today — your battlers in both boxes decide the outcome.');
        break;
      case 'accuracy':
        lines.push('They probe, they pass, and they make you defend every blade of grass. Precision rules today — your best technicians unlock the pattern.');
        break;
    }
  }

  return lines.join(' ');
}

export function getRulesPages(opposition?: OppositionDef): RulesPage[] {
  const pages: RulesPage[] = [
    PAGE_HOW_IT_WORKS,
    PAGE_YOUR_TARGET,
  ];

  if (opposition) {
    pages.push({
      id: 'today-opponent',
      title: 'Today\u2019s opponent',
      paragraphs: [
        `${opposition.label}. ${opponentDescription(opposition.weightMods)}`,
        'Read the opposition. Draft to match.',
      ],
    });
  }

  pages.push(PAGE_HOW_YOURE_JUDGED);

  return pages;
}
