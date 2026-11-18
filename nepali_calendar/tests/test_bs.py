"""Run with: ../../env/bin/python -m unittest nepali_calendar.tests.test_bs  (from the app root)"""

import datetime
import unittest

from nepali_calendar.bs import BSDate, ad_to_bs, bs_to_ad, days_in_month, format_bs, max_year, min_year


class TestBS(unittest.TestCase):
	def test_new_year_dates(self):
		# 1 Baisakh, as published.
		for year, ad in {2079: "2022-04-14", 2080: "2023-04-14", 2081: "2024-04-13", 2082: "2025-04-14"}.items():
			self.assertEqual(bs_to_ad(year, 1, 1), datetime.date.fromisoformat(ad))
			self.assertEqual(ad_to_bs(ad), BSDate(year, 1, 1))

	def test_every_day_round_trips_consecutively(self):
		expected = bs_to_ad(min_year(), 1, 1)
		count = 0
		for year in range(min_year(), max_year() + 1):
			for month in range(1, 13):
				length = days_in_month(year, month)
				self.assertIn(length, range(29, 33), f"{year}/{month}")
				for day in range(1, length + 1):
					ad = bs_to_ad(year, month, day)
					self.assertEqual(ad, expected, f"{year}-{month}-{day}")
					self.assertEqual(ad_to_bs(ad), BSDate(year, month, day))
					expected += datetime.timedelta(days=1)
					count += 1
		self.assertGreater(count, 33000)

	def test_accepts_dates_datetimes_and_strings(self):
		self.assertEqual(ad_to_bs(datetime.date(2026, 11, 18)), BSDate(2083, 8, 2))
		self.assertEqual(ad_to_bs(datetime.datetime(2026, 11, 18, 23, 59)), BSDate(2083, 8, 2))
		self.assertEqual(ad_to_bs("2026-11-18 10:00:00"), BSDate(2083, 8, 2))

	def test_invalid_and_out_of_range(self):
		for value in (None, "", "Today", "18-11-2026", "2025-02-30", 12345):
			self.assertIsNone(ad_to_bs(value), repr(value))
		self.assertIsNone(ad_to_bs(bs_to_ad(min_year(), 1, 1) - datetime.timedelta(days=1)))
		self.assertIsNone(ad_to_bs(bs_to_ad(max_year(), 12, days_in_month(max_year(), 12)) + datetime.timedelta(days=1)))
		with self.assertRaises(ValueError):
			bs_to_ad(2083, 8, 33)
		with self.assertRaises(ValueError):
			bs_to_ad(max_year() + 1, 1, 1)

	def test_format(self):
		self.assertEqual(format_bs("2026-11-18"), "2 Mangsir 2083")
		self.assertEqual(format_bs("2026-11-18", "YYYY-MM-DD"), "2083-08-02")
		self.assertEqual(format_bs("2026-11-18", "D MMMM YYYY", "np"), "२ मंसिर २०८३")
		self.assertEqual(format_bs("not a date"), "")


if __name__ == "__main__":
	unittest.main()
