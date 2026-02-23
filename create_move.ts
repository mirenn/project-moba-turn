import fs from 'fs';
import { selectCPUActions, selectCPUTarget, selectCPUDeployPosition } from './src/game/cpuAI';
import { GameState } from './src/game/types';

const statePath = 'antigravity_state.json';
const movePath = 'antigravity_move.json';

try {
  const stateData = fs.readFileSync(statePath, 'utf8');
  const state: GameState = JSON.parse(stateData);

  let result: any = null;

  if (state.gamePhase === 'deploy') {
    // Not typically called for Antigravity, but just in case
    console.log('Deploy phase, not handled explicitly here for antigravity');
  } else if (state.antigravityState === 'waiting_for_move') {
    const actions = selectCPUActions(state, '1');
    result = { actions };
  } else if (state.antigravityState === 'waiting_for_action_target') {
    const currentAction = state.currentResolvingAction;
    if (currentAction) {
      const champion = state.players['1'].champions.find(c => c.id === currentAction.championId);
      const actionDetails = currentAction.action as any;
      const card = champion?.cards.find(c => c.id === actionDetails.cardId);
      if (champion && card) {
        result = selectCPUTarget(state, champion, card, '1', actionDetails.isAlternativeMove);
      }
    }
  }

  if (result) {
    fs.writeFileSync(movePath, JSON.stringify(result, null, 2));
    console.log('Successfully wrote AI move to', movePath);
  } else {
    console.log('No valid move generated or no state to act on.');
  }
} catch (error) {
  console.error('Error generating move:', error);
}
