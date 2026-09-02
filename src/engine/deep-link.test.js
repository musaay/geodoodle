import { describe, it, expect } from 'vitest';
import { parseDeepLink } from './deep-link.js';

describe('parseDeepLink', () => {
  it('parses a region deep link with an explicit mode', () => {
    expect(parseDeepLink('?region=italy&mode=blind')).toEqual({
      type: 'region', regionId: 'italy', mode: 'blind',
    });
  });

  it('defaults mode to trace when missing', () => {
    expect(parseDeepLink('?region=italy')).toEqual({
      type: 'region', regionId: 'italy', mode: 'trace',
    });
  });

  it('defaults mode to trace when the mode value is unrecognized', () => {
    expect(parseDeepLink('?region=italy&mode=nonsense')).toEqual({
      type: 'region', regionId: 'italy', mode: 'trace',
    });
  });

  it('keeps other params like utm_source out of the result but does not choke on them', () => {
    expect(parseDeepLink('?region=italy&mode=blind&utm_source=share&utm_medium=social')).toEqual({
      type: 'region', regionId: 'italy', mode: 'blind',
    });
  });

  it('parses a daily deep link', () => {
    expect(parseDeepLink('?daily=1')).toEqual({ type: 'daily' });
  });

  it('ignores daily=0 and other truthy-looking values', () => {
    expect(parseDeepLink('?daily=0')).toBeNull();
    expect(parseDeepLink('?daily=true')).toBeNull();
  });

  it('returns null for no query string', () => {
    expect(parseDeepLink('')).toBeNull();
  });

  it('returns null for unrelated query params', () => {
    expect(parseDeepLink('?utm_source=share')).toBeNull();
  });

  it('prefers region over daily when both are present', () => {
    expect(parseDeepLink('?region=italy&daily=1')).toEqual({
      type: 'region', regionId: 'italy', mode: 'trace',
    });
  });
});
