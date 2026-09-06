import { describe, expect, it } from 'vitest';
import { dedupeDropName } from '../src/drop.js';

describe('drop outbox names', () => {
  it('dedupes Windows names case-insensitively before spooling', () => {
    expect(dedupeDropName('photo.jpg', ['photo.jpg'])).toBe('photo-1.jpg');
    expect(dedupeDropName('photo.jpg', ['photo.jpg', 'photo-1.jpg'])).toBe('photo-2.jpg');
    expect(dedupeDropName('Report.PDF', ['report.pdf'])).toBe('Report-1.PDF');
  });

  it('sanitizes pathy or invalid names', () => {
    expect(dedupeDropName('..\\secret?.txt', [])).toBe('secret_.txt');
    expect(dedupeDropName('***', ['___'])).toBe('___-1');
    expect(dedupeDropName('..', [])).toBe('drop');
  });
});
