/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const SRC = join(ROOT, 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Resolves a relative or '@/' specifier to a file of src, else null (packages). */
function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // try the next extension
    }
  }
  return null;
}

/** Runtime imports only: `import type` and `export type` lines are erased by the compiler. */
function runtimeImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const out: string[] = [];
  const re = /^(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm;
  for (const m of text.matchAll(re)) {
    const target = resolveImport(file, m[1]!);
    if (target) out.push(target);
  }
  return out;
}

/** Every module of the cycle through `start`, or null. */
function cycleThrough(start: string, graph: Map<string, string[]>): string[] | null {
  const path: string[] = [];
  const seen = new Set<string>();
  const visit = (f: string): string[] | null => {
    if (f === start && path.length > 0) return [...path, f];
    if (seen.has(f)) return null;
    seen.add(f);
    path.push(f);
    for (const next of graph.get(f) ?? []) {
      const c = visit(next);
      if (c) return c;
    }
    path.pop();
    return null;
  };
  return visit(start);
}

describe('module graph of the editor', () => {
  it('has no runtime import cycle through the tools, the tool registry or the numeric field', () => {
    const files = sourceFiles(SRC);
    const graph = new Map(files.map((f) => [f, runtimeImports(f)]));
    const watched = files.filter((f) => /src\/editor\/(tools\/|numericOverlay|keyboard)/.test(f));
    const cycles = watched
      .map((f) => cycleThrough(f, graph))
      .filter((c): c is string[] => c !== null)
      .map((c) => c.map((f) => relative(ROOT, f)).join(' -> '));
    expect(cycles).toEqual([]);
  });
});
