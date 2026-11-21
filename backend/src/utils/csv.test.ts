import { describe, expect, it } from 'vitest';
import { csvCell, csvRow } from './csv';

describe('csvCell', () => {
  it('leaves plain text alone and renders null and undefined as empty', () => {
    expect(csvCell('Nimal Perera')).toBe('Nimal Perera');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(false)).toBe('false');
  });

  it('quotes commas, quotes and line breaks, doubling inner quotes', () => {
    expect(csvCell('Perera, N')).toBe('"Perera, N"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell('a\rb')).toBe('"a\rb"');
  });

  it.each(['=SUM(A1)', '+94771234567x', '-1+1', '@cmd', '\tcmd', '\rcmd'])('neutralises a leading formula character in %j', (value) => {
    expect(csvCell(value).replace(/^"/, '')).toMatch(/^'/);
  });

  it('does not prefix numbers that are negative or signed because they are numbers, not text', () => {
    expect(csvCell(-5)).toBe('-5');
  });
});

describe('csvRow', () => {
  it('joins cells with commas and ends the line with CRLF', () => {
    expect(csvRow(['a', 'b,c', 3])).toBe('a,"b,c",3\r\n');
  });
});
