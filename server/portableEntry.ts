/**
 * IndSpectora — Standalone Windows Portable Executable Entrypoint
 */
process.env.NODE_ENV = 'production';
process.env.INDSPECTORA_PORTABLE_EXE = '1';

// Suppress Node ExperimentalWarning for built-in node:sqlite in user-facing portable console
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: unknown, ...args: unknown[]) => {
  const msg = typeof warning === 'string' ? warning : (warning as Error)?.message ?? '';
  if (msg.includes('SQLite is an experimental feature')) {
    return;
  }
  return (originalEmitWarning as (...a: unknown[]) => void)(warning, ...args);
}) as typeof process.emitWarning;

async function bootPortable(): Promise<void> {
  await import('../server.ts');
}

void bootPortable();
