"""BS columns in Excel/CSV exports (Report View and query reports).

Each Date/Datetime column gets a "<Label> (BS)" column right after it, holding the BS date
as YYYY-MM-DD (sortable, unambiguous). The original AD column is untouched, so exported
files can still be re-imported. Skipped when the user's date display is "AD".

Frappe has no export hook, so this wraps a few module-level helpers that the export code
looks up at call time; every wrapper is a no-op outside an export.
"""

import functools

import frappe

from nepali_calendar.bs import format_bs
from nepali_calendar.settings import get_date_display

DATE_FIELDTYPES = {"Date", "Datetime"}
_MARK = "_nepali_calendar_original"


def _bs(value) -> str:
	return format_bs(value, "YYYY-MM-DD")


def _bs_label(label) -> str:
	return f"{label or ''} (BS)".strip()


def _exporting() -> bool:
	return bool(getattr(frappe.local, "nc_exporting", False))


def _wrap(module, name, make_wrapper):
	current = getattr(module, name)
	if getattr(current, _MARK, None) is None:
		wrapper = functools.wraps(current)(make_wrapper(current))
		setattr(wrapper, _MARK, current)
		setattr(module, name, wrapper)


def _export_scope(original):
	"""Mark the duration of an export so the helpers below know when to act."""

	def wrapper(*args, **kwargs):
		if get_date_display() == "AD":
			return original(*args, **kwargs)
		frappe.local.nc_exporting = True
		frappe.local.nc_inserted_columns = None
		try:
			return original(*args, **kwargs)
		finally:
			frappe.local.nc_exporting = False
			frappe.local.nc_inserted_columns = None

	return wrapper


# --- Report View ------------------------------------------------------------
# Rows are built as [Sr, *fields]; handle_duration_fieldtype_values() runs on the full table
# (after translation, before CSV/XLSX are written), so BS cells are inserted there. The XLSX
# column styles are built afterwards from a separate column list, so that list gets matching
# placeholder columns in get_default_xlsx_styles().


def _report_view_rows(original):
	def wrapper(parent_doctype, data, fields):
		data = original(parent_doctype, data, fields)
		if not _exporting() or not data:
			return data
		from frappe.desk.reportview import get_field_info

		infos = get_field_info(fields, parent_doctype)
		# Data columns are offset by one because of the leading "Sr" column.
		date_cols = [i + 1 for i, info in enumerate(infos) if info.get("fieldtype") in DATE_FIELDTYPES]
		if not date_cols:
			return data
		for col in reversed(date_cols):
			for r, row in enumerate(data):
				value = _bs_label(row[col]) if r == 0 else _bs(row[col])
				row.insert(col + 1, value)
		frappe.local.nc_inserted_columns = date_cols
		return data

	return wrapper


def _xlsx_styles(original):
	def wrapper(columns, *args, **kwargs):
		inserted = getattr(frappe.local, "nc_inserted_columns", None) if _exporting() else None
		if inserted:
			columns = list(columns)
			for col in reversed(inserted):
				label = columns[col].get("label") if col < len(columns) else ""
				columns.insert(
					col + 1, {"fieldname": f"nc_bs_{col}", "label": _bs_label(label), "fieldtype": "Data"}
				)
		return original(columns, *args, **kwargs)

	return wrapper


# --- Query reports ----------------------------------------------------------
# format_fields() runs before dates are stringified and before build_xlsx_data() derives
# headers, widths and styles from data.columns, so adding real columns there is enough.


def _query_report_fields(original):
	def wrapper(data, file_format_type=None):
		if _exporting() and data.get("columns"):
			_add_bs_columns(data)
		return original(data, file_format_type)

	return wrapper


def _add_bs_columns(data):
	columns = data.columns
	rows = data.get("result") or []
	for i in reversed(range(len(columns))):
		col = columns[i]
		if not isinstance(col, dict) or col.get("fieldtype") not in DATE_FIELDTYPES:
			continue
		fieldname = col.get("fieldname") or f"col_{i}"
		bs_fieldname = f"{fieldname}_nc_bs"
		bs_col = {
			"fieldname": bs_fieldname,
			"label": _bs_label(col.get("label") or fieldname),
			"fieldtype": "Data",
			"width": 110,
			"hidden": col.get("hidden", 0),
		}
		columns.insert(i + 1, bs_col)
		for row in rows:
			if isinstance(row, dict):
				row[bs_fieldname] = _bs(row.get(col.get("fieldname")))
			elif isinstance(row, list | tuple):
				if isinstance(row, tuple):
					continue  # immutable; leave as-is rather than misalign
				row.insert(i + 1, _bs(row[i]) if i < len(row) else "")


def apply():
	import frappe.desk.query_report as query_report
	import frappe.desk.reportview as reportview
	import frappe.utils.xlsxutils as xlsxutils

	_wrap(reportview, "_export_query", _export_scope)
	_wrap(reportview, "handle_duration_fieldtype_values", _report_view_rows)
	_wrap(xlsxutils, "get_default_xlsx_styles", _xlsx_styles)
	_wrap(query_report, "_export_query", _export_scope)
	_wrap(query_report, "format_fields", _query_report_fields)
