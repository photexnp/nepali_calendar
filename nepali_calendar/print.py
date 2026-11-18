"""BS dates in print formats.

- Standard (and Print Format Builder) prints: every Date/Datetime value gets its BS
  equivalent appended, e.g. "18-11-2026 (2 Mangsir 2083 BS)". This only happens while a
  document is being printed (Frappe sets doc.flags.in_print), so list views, reports,
  exports and emails are unchanged.
- Custom Jinja print formats: use {{ bs_date(doc.posting_date) }} and friends (see hooks.jinja).
"""

import frappe
import frappe.utils.formatters

from nepali_calendar.bs import ad_to_bs, format_bs
from nepali_calendar.settings import get_date_display

DATE_FIELDTYPES = {"Date", "Datetime"}


def _lang() -> str:
	return "np" if (getattr(frappe.local, "lang", None) or "").startswith("ne") else "en"


def bs_date(value, fmt: str = "D MMMM YYYY") -> str:
	"""Jinja: {{ bs_date(doc.posting_date) }} -> "2 Mangsir 2083" ("" if not convertible)."""
	return format_bs(value, fmt, _lang())


def bs_date_label(value) -> str:
	"""Jinja: {{ bs_date_label(doc.posting_date) }} -> "2 Mangsir 2083 BS" (or "२ मंसिर २०८३ वि.सं.")."""
	text = format_bs(value, "D MMMM YYYY", _lang())
	if not text:
		return ""
	return f"{text} वि.सं." if _lang() == "np" else f"{text} BS"


def _is_printing(doc) -> bool:
	flags = getattr(doc, "flags", None)
	return bool(flags and flags.get("in_print"))


def _wrap_format_value(original):
	def format_value(value, df=None, doc=None, *args, **kwargs):
		formatted = original(value, df, doc, *args, **kwargs)
		fieldtype = df if isinstance(df, str) else (df or {}).get("fieldtype")
		if fieldtype not in DATE_FIELDTYPES or not formatted or not _is_printing(doc) or not ad_to_bs(value):
			return formatted
		mode = get_date_display()
		if mode == "AD":
			return formatted
		label = bs_date_label(value)
		if mode == "BS":
			# Keep the time part of a Datetime ("18-11-2026 14:30:00" -> "2 Mangsir 2083 BS 14:30:00").
			time = formatted.split(" ", 1)[1] if fieldtype == "Datetime" and " " in formatted else ""
			return f"{label} {time}".strip()
		return f"{formatted} ({label})"

	format_value._nepali_calendar_original = original
	return format_value


def apply():
	current = frappe.utils.formatters.format_value
	if not hasattr(current, "_nepali_calendar_original"):
		frappe.utils.formatters.format_value = _wrap_format_value(current)


def apply_print_patch():
	"""Hooked into before_request / before_job; idempotent, so it's cheap to call every time."""
	from nepali_calendar import export

	apply()
	export.apply()
