const SPEAKER_TAG_RE = /^\s*\[speaker:([a-z][a-z0-9_-]*)\]\s*/;
const SPEAKER_TAG_PREFIX_RE = /^\s*\[speaker:/;

export interface SpeakerTagMatch {
	speakerKey: string;
	tagLength: number;
}

export function parseSpeakerTag(line: string): SpeakerTagMatch | undefined {
	const match = line.match(SPEAKER_TAG_RE);
	if (!match?.[1]) {
		return undefined;
	}
	return {
		speakerKey: match[1],
		tagLength: match[0].length,
	};
}

export function hasSpeakerTagPrefix(line: string): boolean {
	return SPEAKER_TAG_PREFIX_RE.test(line);
}
