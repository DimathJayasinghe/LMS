/** Whole years between a birth date and a day, both `YYYY-MM-DD`; a 29 February birthday counts from 1 March in other years. */
export const ageOnDay = (birthDate: string, day: string): number => {
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number) as [number, number, number];
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const hadBirthday = month > birthMonth || (month === birthMonth && date >= birthDay);
  return year - birthYear - (hadBirthday ? 0 : 1);
};

/** True while the person has not reached `adultAgeYears` on `day`. */
export const isMinorOn = (birthDate: string, day: string, adultAgeYears: number): boolean => ageOnDay(birthDate, day) < adultAgeYears;
