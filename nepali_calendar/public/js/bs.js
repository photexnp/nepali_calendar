// Pure AD <-> Bikram Sambat conversion helpers (no Frappe globals, so they can be unit-tested in Node).

import NepaliDate, { dateConfigMap } from "nepali-date-converter";

export { NepaliDate };

export const MONTH_KEYS = [
	"Baisakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Aswin",
	"Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra",
];
export const BS_YEARS = Object.keys(dateConfigMap).map(Number).sort((a, b) => a - b);
export const MIN_BS_YEAR = BS_YEARS[0];
export const MAX_BS_YEAR = BS_YEARS[BS_YEARS.length - 1];

const pad = (n) => String(n).padStart(2, "0");

/**
 * AD date -> NepaliDate, or null when empty, invalid or out of range.
 * Accepts "YYYY-MM-DD" (anything after the date part is ignored) or a JS Date (its local date is used).
 */
export function ad_to_bs(ad) {
	if (ad instanceof Date) {
		if (isNaN(ad)) return null;
		ad = `${ad.getFullYear()}-${pad(ad.getMonth() + 1)}-${pad(ad.getDate())}`;
	}
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ad ? String(ad) : "");
	if (!match) return null;
	const [year, month, day] = match.slice(1).map(Number);
	const date = new Date(year, month - 1, day);
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
	try {
		return NepaliDate.fromAD(date);
	} catch {
		return null;
	}
}

/** BS year, month index (0 = Baisakh), day -> "YYYY-MM-DD" (AD). */
export function bs_to_ad(year, month, day) {
	const date = new NepaliDate(year, month, day).toJsDate();
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function days_in_month(year, month) {
	return dateConfigMap[year][MONTH_KEYS[month]];
}

/** NepaliDate -> "2083-08-02" (ASCII digits). */
export function bs_iso(nd) {
	return `${nd.getYear()}-${pad(nd.getMonth() + 1)}-${pad(nd.getDate())}`;
}

/**
 * Typed BS date -> "YYYY-MM-DD" (AD), or null if it isn't a valid BS date in range.
 * Accepts YYYY-MM-DD, YYYY/MM/DD or YYYY.MM.DD, with ASCII or Devanagari digits.
 */
export function parse_bs(text) {
	const ascii = String(text ?? "").trim().replace(/[०-९]/g, (d) => "०१२३४५६७८९".indexOf(d));
	const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(ascii);
	if (!match) return null;
	const [year, month, day] = match.slice(1).map(Number);
	if (year < MIN_BS_YEAR || year > MAX_BS_YEAR || month < 1 || month > 12) return null;
	if (day < 1 || day > days_in_month(year, month - 1)) return null;
	return bs_to_ad(year, month - 1, day);
}
