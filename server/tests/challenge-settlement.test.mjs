import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleChallengeParticipant } from '../src/challengeSettlement.mjs';
const room={state:'FINISHED',mode:'DUEL',matchStartedAt:10,finishReason:'score'};
const player={actorKind:'human',connected:true,profileToken:'guest'};
test('challenge eligibility includes genuine short hosted matches and bot duels',()=>{
  for(const mode of ['FFA','DUEL','BOT_DUEL']) assert.equal(eligibleChallengeParticipant({...room,mode},player),true);
});
test('practice, offline, forfeit, departed, bot and profileless participants earn no feats',()=>{
  for(const change of [{mode:'PRACTICE'},{mode:'OFFLINE'},{state:'PLAYING'},{matchStartedAt:null},{finishReason:'forfeit'}]) assert.equal(eligibleChallengeParticipant({...room,...change},player),false);
  for(const change of [{connected:false},{actorKind:'bot'},{profileToken:null}]) assert.equal(eligibleChallengeParticipant(room,{...player,...change}),false);
});
