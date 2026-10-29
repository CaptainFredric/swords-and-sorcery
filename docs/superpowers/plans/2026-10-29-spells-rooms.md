# Spell presentation, Gale control and room reliability

Goal: implement the creator's October29 request in a reviewable branch without publishing.

Use executing-plans inline. No reviewers or subagents. Source baseline536e86d,1875tests passing.

1. Coreflagration. Shared fuse0.5seconds, retain5initial/20finaldamage, cooldown and parry. Use authored flight/countdown clips, keep3mwarningringfixed, compact outward flash at first contact and ordinary final explosion. Tests in server/tests/coreflagration.test.mjs and a pure client presentation model. Inspect actual browser effects.
2. Gale. Shared bounded profiles: balanced default, burst and sustained. Gather remains0.5seconds/cooldown6seconds/maximum8damage appliedonce. Swipeup selectsburst, downtowardplayer selects sustained; tapbalanced. Mode selection accepted only during actualpendingGale beforecommit, never clientprovidedforces. Sustained wind lasts with its animation; bounded caster lift and body carry. Desktop wheel duringgather offers parity. Preserve Chivalry selection, cancellation and multitouch. Update Armory/HowtoPlay facts. Shared model, authority andTouchControltests.
3. Tutorial. Remove redundant nonfunctional touchMenu duringtutorial, retaining normal TutorialOptions/transcript andleave/restart. Ordinarymenu unchanged.
4. Rooms. Preserve existing publicmajorityvote behavior; allow validcustomscore/timevotes andstablerendering. Privatehost config for mode, compatiblemap, score/time,team size andswap slots whilewaiting; servervalidates rights/capacity, resetsreadiness andinvalidates oldvotes. Explicit errors onrejectedcontrols. Humanjoin replacesbot andrestores balanced slots; departedhosts handcontrol toconnectedhuman. Fix map registry mismatch includingOuterworks. Avoidrebuildingfocusedcontrols on500msclockupdates.
5. Verify focusedtests thenfullverify/HTML5. Actualdesktop/touchspelland2clientroomchecks with local authoritative server. Recordonlymeaningfulscreenshots/video. Confirmroomactionsandremoteevents. Commit andpreparefocused draftPR,attachit. No merge/deploy oritchupload.

Finish: requestedspell/roomchangesimplemented,tests/exportpass,actualbrowserUIcheckscomplete,evidenceandconciselimitationsincludedindraftPR. Preserve unrelatedworktreesandpublishedbuild.
