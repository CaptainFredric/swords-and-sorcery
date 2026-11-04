import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createChivalryLink} from './chivalryLink.mjs';

const fighter = () => ({
  alive: true, ultimate: 'chivalry',
  ultimateState: {id:'chivalry',phase:'active',commitAt:10,until:16},
  preparedSpells: ['fireball','frostfire','gale'],
  operatingFightFlightId: 'flight-1',
  position: {x:0,y:5,z:0},
});

test('a mounted Chivalry tell accepts null action layers without killing the animation frame', () => {
  const root = new THREE.Group();
  const anchor = new THREE.Object3D();
  anchor.position.set(.23,1.2,-.12);
  root.add(anchor);
  const link = createChivalryLink(root, () => ({sorcery:anchor}));
  const group = root.getObjectByName('ChivalryCommitSignatures');

  assert.doesNotThrow(() => link.set(fighter(),10.14,null),
    'RemotePlayers explicitly uses concurrent:null when a machine suspends action layers');
  assert.equal(group.visible,true,'the visual commit tell is not silently suppressed');

  // A full terminal Dive spends Chivalry without starting an ordinary
  // Chivalry ultimateState; its previous visual tell may be fading out.
  link.event({type:'ultimateEnded',ultimate:'chivalry',at:10.2});
  assert.doesNotThrow(() => link.set({...fighter(),ultimateState:null},10.23,null),
    'the tell can finish while the rider is no longer in an ordinary combat pose');
  assert.doesNotThrow(() => link.set({...fighter(),alive:false,ultimateState:null},10.3,null),
    'fatal terminal impact may also be followed by a final corpse pose');
  assert.doesNotThrow(() => link.set(fighter(),10.35,undefined));
  assert.doesNotThrow(() => link.dispose());
});
