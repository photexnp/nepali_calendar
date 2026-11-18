"""AD <-> Bikram Sambat (BS) conversion.

Uses bs_data.json, generated from the same table as the desk date picker
(see scripts/generate_bs_data.mjs), so prints and forms always agree.
Kept free of Frappe imports so it can be unit-tested on its own.
"""

import datetime
import json
import re
from functools import cache
from pathlib import Path
from typing import NamedTuple

NP_DIGITS = str.maketrans("0123456789", "०१२३४५६७८९")


class BSDate(NamedTuple):
	year: int
	month: int  # 1 = Baisakh … 12 = Chaitra
	day: int


@cache
def _data() -> dict:
	data = json.loads((Path(__file__).parent / "bs_data.json").read_text(encoding="utf-8"))
	years = sorted(int(y) for y in data["month_lengths"])
	lengths = {int(y): v for y, v in data["month_lengths"].items()}
	# Days from the epoch (1 Baisakh of the first year) to 1 Baisakh of each year.
	year_start, total = {}, 0
	for year in years:
		year_start[year] = total
		total += sum(lengths[year])
	return {
		"epoch": datetime.date.fromisoformat(data["epoch"]["ad"]),
		"lengths": lengths,
		"years": years,
		"year_start": year_start,
		"total_days": total,
		"month_names": data["month_names"],
	}


def min_year() -> int:
	return _data()["years"][0]


def max_year() -> int:
	return _data()["years"][-1]


def days_in_month(year: int, month: int) -> int:
	return _data()["lengths"][year][month - 1]


def _to_date(value) -> datetime.date | None:
	if isinstance(value, datetime.datetime):
		return value.date()
	if isinstance(value, datetime.date):
		return value
	if isinstance(value, str):
		match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", value.strip())
		if match:
			try:
				return datetime.date(*(int(part) for part in match.groups()))
			except ValueError:
				return None
	return None


def ad_to_bs(value) -> BSDate | None:
	"""AD date, datetime or "YYYY-MM-DD[ ...]" string -> BSDate; None if empty, invalid or out of range."""
	date = _to_date(value)
	if date is None:
		return None
	d = _data()
	offset = (date - d["epoch"]).days
	if offset < 0 or offset >= d["total_days"]:
		return None
	for year in reversed(d["years"]):
		if d["year_start"][year] <= offset:
			break
	offset -= d["year_start"][year]
	for month, length in enumerate(d["lengths"][year], start=1):
		if offset < length:
			return BSDate(year, month, offset + 1)
		offset -= length
	return None  # unreachable: offset is within the year's total


def bs_to_ad(year: int, month: int, day: int) -> datetime.date:
	"""BS year, month (1-12), day -> AD date. Raises ValueError if the BS date doesn't exist."""
	d = _data()
	if year not in d["lengths"] or not 1 <= month <= 12 or not 1 <= day <= days_in_month(year, month):
		raise ValueError(f"BS date {year}-{month:02d}-{day:02d} is invalid or outside {min_year()}–{max_year()}")
	offset = d["year_start"][year] + sum(d["lengths"][year][: month - 1]) + day - 1
	return d["epoch"] + datetime.timedelta(days=offset)


def format_bs(value, fmt: str = "D MMMM YYYY", lang: str = "en") -> str:
	"""Format an AD date as BS. Tokens: YYYY, MMMM (month name), MM, M, DD, D.

	lang="np" uses Devanagari digits and month names. Returns "" when the date can't be converted.
	"""
	bs = value if isinstance(value, BSDate) else ad_to_bs(value)
	if bs is None:
		return ""
	names = _data()["month_names"]["np" if lang == "np" else "en"]
	tokens = {
		"YYYY": str(bs.year),
		"MMMM": names[bs.month - 1],
		"MM": f"{bs.month:02d}",
		"M": str(bs.month),
		"DD": f"{bs.day:02d}",
		"D": str(bs.day),
	}
	out = re.sub(r"YYYY|MMMM|MM|M|DD|D", lambda m: tokens[m.group(0)], fmt)
	if lang == "np":
		# Translate digits only, never the Devanagari month name (which has none).
		out = out.translate(NP_DIGITS)
	return out
