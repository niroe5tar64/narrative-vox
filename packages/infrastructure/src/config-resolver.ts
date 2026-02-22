import path from "node:path";
import { pathExists } from "./fs-utils.ts";

export async function resolveSynthesisDefaultsPath(
	synthesisDefaultsPath?: string,
): Promise<string> {
	if (synthesisDefaultsPath) {
		return path.resolve(synthesisDefaultsPath);
	}

	const localDefault = path.resolve(
		"configs/voice/voicevox/synthesis-defaults.json",
	);
	if (await pathExists(localDefault)) {
		return localDefault;
	}

	throw new Error(
		`Synthesis defaults not found: ${localDefault}. Create configs/voice/voicevox/synthesis-defaults.json or pass --synthesis-defaults.`,
	);
}

export async function resolveSpeedProfilesPath(
	speedProfilesPath?: string,
): Promise<string | undefined> {
	if (speedProfilesPath) {
		return path.resolve(speedProfilesPath);
	}

	const localDefault = path.resolve(
		"configs/voice/voicevox/speed-profiles.json",
	);
	if (await pathExists(localDefault)) {
		return localDefault;
	}
	return undefined;
}
