function canonical(text: string): string {
  return text.replace(/\s+/g, " ");
}

export function estimateTokens(text: string): number {
  return Math.ceil(Buffer.byteLength(canonical(text), "utf8") / 4);
}
