import { execFile } from 'node:child_process';
import path from 'node:path';

export function runPythonStats<T = unknown>(task: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.resolve(process.cwd(), 'python', 'stats_engine.py');
    const child = execFile(
      'python3',
      [scriptPath],
      { maxBuffer: 25 * 1024 * 1024, timeout: 30000 },
      (error, stdout, stderr) => {
        if (error) {
          return reject(new Error(`Python stats engine failed: ${stderr || error.message}`));
        }
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.error) {
            return reject(new Error(parsed.error));
          }
          resolve(parsed as T);
        } catch (parseErr) {
          reject(new Error(`Invalid JSON from Python stats engine: ${String(parseErr)}`));
        }
      }
    );

    if (child.stdin) {
      child.stdin.write(JSON.stringify({ task, payload }));
      child.stdin.end();
    }
  });
}
