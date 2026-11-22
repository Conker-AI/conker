"""conker prompt templates: the owner's prompt templates in Pi, listed, shown, added and removed.

Pi routes: GET/POST /prompts/templates, GET /prompts/templates/{id}, POST
/prompts/templates/{id}/delete (Conker-AI/pi, docs prompt-templates.md). Pi checks every value;
this module only shapes the call and prints the result. Editing a template stays in the dashboard.
"""

import json
import re
import sys
from pathlib import Path

from scripts.cli.conker_context import pi_call
from scripts.cli.conker_inputs import read_text

TEMPLATE_ID = r"(?:tpl_[0-9a-f]{32}|starter-[a-z0-9]+(?:-[a-z0-9]+)*)"
FIELDS_LIMIT = 64000


def register(verbs):
    """Add `templates list|show|add|remove` under `conker prompt`."""
    templates = verbs.add_parser("templates", help="Your prompt templates (forms for a request)")
    actions = templates.add_subparsers(dest="action", required=True)
    listed = actions.add_parser("list", help="Every template: the starters, then yours")
    listed.add_argument("--json", action="store_true", help="Print Pi's reply as JSON")
    show = actions.add_parser("show", help="One template with its fields")
    show.add_argument("template", help="Its id, tpl_... or starter-...")
    show.add_argument("--json", action="store_true", help="Print Pi's reply as JSON")
    add = actions.add_parser("add", help="Save a new template from a JSON list of fields")
    add.add_argument("--name", required=True, help="1-60 characters")
    add.add_argument("--description", default="", help="Up to 200 characters")
    add.add_argument(
        "--fields", required=True, help="A JSON file with the list of fields, or - for stdin"
    )
    add.add_argument("--json", action="store_true", help="Print Pi's reply as JSON")
    remove = actions.add_parser("remove", help="Delete a template (a starter too)")
    remove.add_argument("template", help="Its id, tpl_... or starter-...")
    remove.add_argument("--yes", action="store_true", help="Confirm the deletion")


def _identity(value):
    if not re.fullmatch(TEMPLATE_ID, value):
        raise ValueError("Use a template id (tpl_ and 32 hex digits, or starter-NAME).")
    return value


def read_fields(source):
    """The field list from a JSON file or stdin; Pi checks each field."""
    if source == "-":
        raw = sys.stdin.buffer.read(FIELDS_LIMIT + 1)
        if len(raw) > FIELDS_LIMIT:
            raise ValueError("The fields exceed their size limit.")
        text = raw.decode("utf-8-sig", errors="replace")
    else:
        text = read_text(Path(source), FIELDS_LIMIT, "The fields file")
    try:
        fields = json.loads(text)
    except ValueError:
        raise ValueError("The fields must be JSON: a list of field objects.") from None
    if not isinstance(fields, list) or not all(isinstance(item, dict) for item in fields):
        raise ValueError("The fields must be a JSON list of field objects.")
    return fields


def render_list(page):
    lines = [f"{page['total']} templates."]
    for item in page["items"]:
        kind = "starter, " if item["starter"] else ""
        count = len(item["fields"])
        lines.append(f"{item['id']}  {item['name']}  ({kind}{count} fields)  {item['description']}")
    return "\n".join(lines)


def render_template(item):
    kind = ", starter" if item["starter"] else ""
    lines = [f"{item['name']}  ({item['id']}, version {item['revision']}{kind})"]
    if item["description"]:
        lines.append(item["description"])
    lines += ["", "Fields:"]
    for field in item["fields"]:
        extra = "  required" if field.get("required") else ""
        if field.get("options"):
            many = " (several)" if field.get("multiple") else ""
            extra += "  " + " | ".join(field["options"]) + many
        lines.append(f"  {field['id']:<12} {field['type']:<10} {field['label']}{extra}")
    return "\n".join(lines)


def operation(args, config, request):
    """Run one templates verb; returns the value to print, or None when it printed itself."""
    if args.action == "list":
        page = pi_call(request, config, "/prompts/templates")
        if args.json:
            return page
        print(render_list(page))
        return None
    if args.action == "show":
        reply = pi_call(request, config, f"/prompts/templates/{_identity(args.template)}")
        if args.json:
            return reply
        print(render_template(reply["template"]))
        return None
    if args.action == "add":
        body = {
            "name": args.name,
            "description": args.description,
            "fields": read_fields(args.fields),
        }
        reply = pi_call(request, config, "/prompts/templates", body)
        if args.json:
            return reply
        print(f"Saved {reply['template']['name']} as {reply['template']['id']}.")
        return None
    template = _identity(args.template)
    if not args.yes:
        raise ValueError(f"Deleting {template} cannot be undone here. Add --yes to confirm.")
    return pi_call(request, config, f"/prompts/templates/{template}/delete", {})
