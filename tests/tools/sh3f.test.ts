import { describe, expect, it } from 'vitest';
import { uniqueKey } from '../../tools/models/lib/sh3f';

describe('uniqueKey', () => {
  it('keeps the end of the catalog id, and appends the author on a collision', () => {
    const taken = new Set<string>();
    expect(uniqueKey('Sheep#desk', taken)).toBe('desk');
    expect(uniqueKey('Ravey#desk', taken)).toBe('desk-ravey');
    expect(uniqueKey('Blend Swap CC-0#antiqueChair', taken)).toBe('antiqueChair');
    expect(uniqueKey('Peter Smolik#antiqueChair', taken)).toBe('antiqueChair-peter-smolik');
  });

  it('treats keys differing only by case as a collision (one file on the Mac)', () => {
    const taken = new Set<string>();
    expect(uniqueKey('Geantick#glassDoorCabinet', taken)).toBe('glassDoorCabinet');
    expect(uniqueKey('Pastierovic#glassdoorCabinet', taken)).toBe('glassdoorCabinet-pastierovic');
  });

  it('refuses keys that could leave the library folder', () => {
    expect(() => uniqueKey('x#../evil', new Set())).toThrow(/unsafe/);
  });

  it('stops on a collision it cannot solve', () => {
    const taken = new Set(['desk', 'desk-ravey']);
    expect(() => uniqueKey('Ravey#desk', taken)).toThrow(/collision/);
  });
});
