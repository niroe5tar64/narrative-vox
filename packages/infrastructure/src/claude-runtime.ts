export async function runClaudeWithPrompt(prompt: string): Promise<string> {
  const repoRoot = process.cwd();
  const proc = Bun.spawn(["claude", "--print", "-"], {
    cwd: repoRoot,
    stdin: new TextEncoder().encode(prompt),
    stdout: "pipe",
    stderr: "pipe",
  });

  const startTime = Date.now();
  const heartbeat = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(`[claude] Still generating... (${elapsed}s)\n`);
  }, 5000);

  const stderrStream = proc.stderr;
  if (stderrStream) {
    (async () => {
      const reader = stderrStream.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          process.stderr.write(decoder.decode(value, { stream: true }));
        }
      } finally {
        reader.releaseLock();
      }
    })().catch(() => {
      // ignore stderr read errors
    });
  }

  const outputChunks: string[] = [];
  const stdoutStream = proc.stdout;
  try {
    if (stdoutStream) {
      const reader = stdoutStream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (buffer.length > 0) {
              outputChunks.push(buffer);
              process.stdout.write(`${buffer}\n`);
            }
            break;
          }
          const text = decoder.decode(value, { stream: true });
          outputChunks.push(text);
          buffer += text;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            process.stdout.write(`${line}\n`);
          }
        }
      } finally {
        reader.releaseLock();
      }
    }
  } finally {
    clearInterval(heartbeat);
  }

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`claude --print - exited with code ${exitCode}`);
  }
  return outputChunks.join("");
}

export function extractJson(output: string): unknown {
  const match = output.match(/```json\n([\s\S]+?)\n```/);
  if (match) {
    return JSON.parse(match[1]);
  }
  return JSON.parse(output.trim());
}
