const COLOMBO = "Asia/Colombo";
const day = new Intl.DateTimeFormat("en-LK", { day: "numeric", month: "short", timeZone: COLOMBO });
const time = new Intl.DateTimeFormat("en-LK", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: COLOMBO });

export const consoleDay = (iso: string): string => day.format(new Date(iso));
export const consoleTime = (iso: string): string => time.format(new Date(iso));
export const consoleDayTime = (iso: string): string => `${consoleDay(iso)}, ${consoleTime(iso)}`;

export const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;
