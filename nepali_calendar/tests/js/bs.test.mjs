// Run with: node --test nepali_calendar/tests/js/
import { test } from "node:test";
import assert from "node:assert/strict";

import {
	ad_to_bs, bs_to_ad, bs_iso, parse_bs, days_in_month, BS_YEARS, MIN_BS_YEAR, MAX_BS_YEAR,
} from "../../public/js/bs.js";

test("parse_bs reads typed BS dates and rejects invalid ones", () => {
	assert.equal(parse_bs("2083-08-02"), "2026-11-18");
	assert.equal(parse_bs("2083/8/2"), "2026-11-18");
	assert.equal(parse_bs(" 2083.08.02 "), "2026-11-18");
	assert.equal(parse_bs("२०८३-०८-०२"), "2026-11-18");
	for (const bad of ["", null, "2083-08-33", "2083-13-01", "1999-01-01", "2091-01-01", "18-11-2026", "2083-08", "abc"]) {
		assert.equal(parse_bs(bad), null, String(bad));
	}
});

test("bs_iso and Date input", () => {
	assert.equal(bs_iso(ad_to_bs("2026-11-18")), "2083-08-02");
	assert.equal(bs_iso(ad_to_bs(new Date(2026, 10, 18, 23, 30))), "2083-08-02");
	assert.equal(ad_to_bs(new Date("invalid")), null);
});

const bs = (nd) => nd && [nd.getYear(), nd.getMonth() + 1, nd.getDate()];

test("Nepali New Year (1 Baisakh) falls on the published AD dates", () => {
	const new_years = {
		2079: "2022-04-14",
		2080: "2023-04-14",
		2081: "2024-04-13",
		2082: "2025-04-14",
	};
	for (const [year, ad] of Object.entries(new_years)) {
		assert.equal(bs_to_ad(Number(year), 0, 1), ad, `1 Baisakh ${year}`);
		assert.deepEqual(bs(ad_to_bs(ad)), [Number(year), 1, 1], ad);
	}
});

test("every BS day in range round-trips and maps to consecutive AD days", () => {
	let previous = null;
	let count = 0;
	for (const year of BS_YEARS) {
		for (let month = 0; month < 12; month++) {
			const length = days_in_month(year, month);
			assert.ok(length >= 29 && length <= 32, `${year}/${month + 1} has ${length} days`);
			for (let day = 1; day <= length; day++) {
				const ad = bs_to_ad(year, month, day);
				assert.deepEqual(bs(ad_to_bs(ad)), [year, month + 1, day], ad);
				if (previous) {
					const gap = (Date.UTC(...ad.split("-").map((n, i) => n - (i === 1))) -
						Date.UTC(...previous.split("-").map((n, i) => n - (i === 1)))) / 86400000;
					assert.equal(gap, 1, `${previous} -> ${ad}`);
				}
				previous = ad;
				count++;
			}
		}
	}
	assert.ok(count > 33000, `checked ${count} days`);
});

test("ad_to_bs ignores the time part of a datetime", () => {
	assert.deepEqual(bs(ad_to_bs("2025-04-14 23:59:59")), [2082, 1, 1]);
});

test("ad_to_bs returns null for empty, malformed, impossible or out-of-range dates", () => {
	for (const value of [null, undefined, "", "Today", "14-04-2025", "2025-02-30", "2025-13-01"]) {
		assert.equal(ad_to_bs(value), null, String(value));
	}
	assert.equal(ad_to_bs(bs_to_ad(MIN_BS_YEAR, 0, 1).replace(/^\d{4}/, (y) => y - 1)), null, "before range");
	assert.equal(ad_to_bs("2099-01-01"), null, "after range");
	assert.equal(MAX_BS_YEAR >= 2090, true);
});
