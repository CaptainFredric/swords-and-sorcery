import { tutorialCueForDevice } from './tutorialRecordings.mjs';

// The transcript: every spoken line of the tutorial, chapter by chapter, as this device hears it (its touch takes on a
// touch screen), each with its recording; which have been had, and which is being had now. An aside is listed in its
// chapter once it has been heard (asides are had only as play makes them, and a transcript does not promise one).

/**
 * chapters: [{ id, title, reached, lines: [{ id, speaker, line, recordingKey, heard, current, aside }] }]
 * director: the session's; context: the device's ({ touch }); heardAsides: the ids of the asides heard so far.
 */
export function tutorialTranscript(director, context = {}, heardAsides = new Set()) {
  const running = director.state === 'running';
  const at = running ? director.index : director.beats.length;
  const now = director.progress?.optional?.id ?? (running && director.current?.kind === 'dialogue' ? director.current.id : null);
  const asides = Object.values(director.branches ?? {}).flat();
  return director.chapters.map(chapter => {
    const lines = [];
    director.beats.forEach((beat, index) => {
      if (beat.chapter !== chapter.id || beat.kind !== 'dialogue') return;
      const spoken = tutorialCueForDevice(beat, context) ?? beat;
      lines.push({ id: beat.id, speaker: beat.speaker, line: spoken.line, recordingKey: spoken.recordingKey ?? beat.recordingKey,
        heard: index < at, current: beat.id === now, aside: false });
    });
    for (const aside of asides) {
      if (aside.chapter !== chapter.id || !heardAsides.has(aside.id)) continue;
      const spoken = tutorialCueForDevice(aside, context) ?? aside;
      lines.push({ id: aside.id, speaker: aside.speaker, line: spoken.line, recordingKey: spoken.recordingKey ?? aside.recordingKey,
        heard: true, current: aside.id === now, aside: true });
    }
    const first = director.beats.findIndex(beat => beat.chapter === chapter.id);
    return { id: chapter.id, title: chapter.title, reached: first >= 0 && first <= at, lines };
  });
}
