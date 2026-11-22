import { describe, expect, it } from 'vitest';
import { namesSimilar } from './person-name';

describe('namesSimilar', () => {
  it.each([
    ['Nimal Perera', 'nimal perera'],
    ['Nimal  Perera', 'Nimal Perera'],
    ['Perera Nimal', 'Nimal Perera'],
    ['Nimal Perera', 'Nimal K. Perera'],
    ['Nimal Perera', 'Nimal Pereira'],
    ['Kasun Silva', 'Kasun Silvaa'],
    ['අමල් පෙරේරා', 'අමල් පෙරේරා'],
  ])('flags %s and %s', (a, b) => {
    expect(namesSimilar(a, b)).toBe(true);
  });

  it.each([
    ['Nimal Perera', 'Kamal Perera'],
    ['Nimal Perera', 'Sunil Fernando'],
    ['Amal', 'Kamal Perera'],
    ['', 'Nimal'],
    ['Nimal', ''],
  ])('does not flag %s and %s', (a, b) => {
    expect(namesSimilar(a, b)).toBe(false);
  });

  it('does not flag siblings who share only a surname', () => {
    expect(namesSimilar('Dinuka Perera', 'Sachini Perera')).toBe(false);
  });
});
