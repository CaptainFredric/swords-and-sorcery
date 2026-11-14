import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {siegeArmoryView} from './siegeArmoryView.mjs';
import {practiceSiegeCopy,practiceSiegeParagraphs} from './practiceSiegeStory.mjs';

const bindings=[['bi-bye-llista','biBye'],['so-fist-ication','soFist'],['fight-and-flight','fightFlight']];
test('all three Practice machines borrow complete stories, mottos and facts verbatim from the canonical Armory',()=>{
 const machines=Object.fromEntries(siegeArmoryView().map(m=>[m.id,m]));
 for(const [id,canonical] of bindings){
  const copy=practiceSiegeCopy(id),source=machines[canonical];
  assert.ok(copy,id);
  for(const field of ['line','subtitle','facts','name','preview'])
   assert.equal(copy[field],source[field],id+' must use canonical '+field);
  assert.ok(practiceSiegeParagraphs(copy.line).length>=2,
   id+' full story must be present, not merely the teaser');
 }
 assert.equal(practiceSiegeCopy('unknown'),null);
});
test('Fight-and-Flight Practice teaser and complete nine-paragraph Armory lore stay intact',()=>{
 const copy=practiceSiegeCopy('fight-and-flight');
 assert.equal(copy.preview,'Why choose to Fight or Flee? When you could be Free?');
 const paragraphs=practiceSiegeParagraphs(copy.line);
 assert.equal(paragraphs.length,9);
 assert.equal(paragraphs[0][0].text,copy.preview);
 assert.equal(paragraphs[0][0].em,true);
 assert.match(paragraphs[1].map(t=>t.text).join(''),/do both at the same time/);
 assert.match(paragraphs.at(-1).map(t=>t.text).join(''),/nigh-unreachable/);
 assert.ok(paragraphs.some(p=>p.some(t=>t.em&&t.text==='they')),
  'the original intentional italics should render as actual emphasis');
});
test('Practise lore paragraph tokenizer preserves punctuation without treating its contents as HTML',()=>{
 assert.deepEqual(practiceSiegeParagraphs('A *bold* choice.\n\nMore words.'),[
  [{text:'A ',em:false},{text:'bold',em:true},{text:' choice.',em:false}],
  [{text:'More words.',em:false}]
 ]);
 assert.equal(practiceSiegeParagraphs('').length,0);
});
test('Practice DOM has a stable expandable reading area and actions outside the clipped lore',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const js=readFileSync(new URL('../main.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
 const from=html.indexOf('id="practice-siege-machinations"');
 const to=html.indexOf('id="practice-hostile-siege"',from);
 assert.ok(from>0&&to>from);
 const card=html.slice(from,to);
 for(const key of ['practice-siege-type','practice-siege-story','practice-siege-story-copy',
  'practice-siege-more','practice-build-bibye','practice-rebuild-bibye','practice-dismantle-bibye'])
  assert.match(card,new RegExp('id="'+key+'"'));
 assert.match(card,/aria-controls="practice-siege-story-copy" aria-expanded="false"/);
 assert.ok(card.indexOf('practice-siege-more')<card.indexOf('practice-build-bibye'),
  'reading the story may not bury the machine-build controls');
 assert.match(js,/content\.dataset\.machine===machine/,'30Hz snapshots must not reset reading state');
 assert.match(js,/toggle\.setAttribute\('aria-expanded',String\(expanded\)\)/);
 assert.match(css,/mask-image:linear-gradient\(to bottom/,'the preview must fade rather than truncate abruptly');
 assert.match(css,/practice-siege-story\.expanded \.practice-siege-story-copy/);
 assert.match(css,/practice-siege-actions button\[hidden\]/);
});
