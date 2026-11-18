"""Date display mode: "Both" (AD + BS), "BS" or "AD".

System default lives in Nepali Calendar Settings; each user can override it with the
"Date Display" field on their User record (custom field nc_date_display).
"""

import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

MODES = ("Both", "BS", "AD")
DEFAULT_MODE = "Both"
USER_FIELD = "nc_date_display"


def get_date_display(user: str | None = None) -> str:
	user = user or frappe.session.user
	# Per-request memo (frappe.local is reset for every request/job).
	cache = getattr(frappe.local, "nc_date_display", None)
	if cache is None:
		cache = {}
		frappe.local.nc_date_display = cache
	if user not in cache:
		cache[user] = _resolve(user)
	return cache[user]


def _resolve(user: str) -> str:
	mode = None
	if user and user != "Guest":
		try:
			mode = frappe.get_cached_value("User", user, USER_FIELD)
		except Exception:
			mode = None  # custom field not created yet (before migrate)
	if mode not in MODES:
		try:
			mode = frappe.db.get_single_value("Nepali Calendar Settings", "date_display", cache=True)
		except Exception:
			mode = None  # doctype not migrated yet
	return mode if mode in MODES else DEFAULT_MODE


def boot_session(bootinfo):
	bootinfo.nepali_calendar = {"date_display": get_date_display()}


def setup_custom_fields():
	"""after_install / after_migrate: per-user override on the User form."""
	create_custom_fields(
		{
			"User": [
				{
					"fieldname": USER_FIELD,
					"fieldtype": "Select",
					"label": "Date Display",
					"options": "\nBoth\nBS\nAD",
					"insert_after": "language",
					"description": "Bikram Sambat (BS) / AD date display for this user. "
					"Leave empty to use the default from Nepali Calendar Settings. Reload after changing.",
				}
			]
		},
		update=True,
	)


def remove_custom_fields():
	"""before_uninstall."""
	frappe.db.delete("Custom Field", {"dt": "User", "fieldname": USER_FIELD})
	frappe.clear_cache(doctype="User")
