---
name: myx
description: Use the MyX personal life manager — money, tasks, notes, memories and checklists. Load when the user asks about their spending, balance, bills, budgets, loans, savings goals, investments, to-dos, notes, memories or checklists, or asks to record any of those.
homepage: https://myx.samchitech.com
metadata:
  emoji: 🗂️
---

# MyX

MyX is one person's private life manager. The `myx` MCP server is the whole
interface — every `myx_*` tool listed there works against the live account.

## Before anything else

- **Money is in rupees.** `250.5` means ₹250.50. Never send paise; the app
  converts.
- **Dates are `YYYY-MM-DD`.** Resolve "tomorrow" and "last Friday" yourself
  before calling anything.
- **Every task belongs to a space** — Personal, Work, and whatever else the user
  has made. Call `myx_spaces_list` and pick the one that fits the task's subject.
  Do not invent a space id.

## Where to start

| The user asks | Call |
|---|---|
| "how am I doing", "what's today look like" | `myx_dashboard` |
| something by name, module unknown | `myx_search` |
| about spending patterns, categories, trends | `myx_money_dashboard` |
| about a specific entry | the module's `_list` tool with filters |

`myx_dashboard` is one call and answers most morning questions: balance, this
month against last, tasks due today, bills due this week. Reach for it before
listing anything.

## Reading

Lists are filtered server-side — pass the filters rather than fetching
everything and sifting. `myx_transactions_list` takes a date range, a category, a
text query and an amount range; `myx_tasks_list` takes `view: today | upcoming |
inbox`, plus space, project and label.

`myx_notes_list` returns titles and metadata without bodies. Fetch the body with
`myx_note_get` once you know which note you want.

## Writing

Writes are real and there is no undo from here. Say what you are about to do,
then do it — do not narrate a plan and stop, and do not batch six writes off one
ambiguous sentence.

Confirm first, every time, for:

- `myx_recurring_pay` — creates a real transaction and moves the due date. Pass
  `expected_next_due` from the list so a retry cannot pay the bill twice.
- `myx_checklist_reset` — throws away the current run's ticks.
- Anything where you guessed at an amount, a category or a date.

`myx_note_update` **replaces** the body. Read the note, edit the whole text, send
it all back. Sending a fragment silently destroys the rest.

For `myx_task_add`, leaving `project_id` out puts the task in the Inbox, which is
the right answer when the user did not name a project. Do not guess one.

## What this cannot do

Nothing here deletes. There are no tools for removing transactions, tasks or
notes, and that is deliberate — deletion stays a deliberate act in the app. If
the user wants something gone, say so and point them at MyX rather than trying to
approximate it by emptying fields.

Keys also cannot touch the account itself: no password change, no sign-out, no
account deletion, no new keys. A 403 from one of those is the design working, not
a bug to route around.

## When something fails

Tool errors carry the API's own message — `space_id is required`,
`occurred_on must be YYYY-MM-DD`, `This bill was already marked paid.` Read it
and fix the call. Two failures on the same call means ask the user rather than
guessing a third time.

A 401 means the key was revoked or expired. Tell the user to mint a new one in
MyX under **Settings → Connections**; nothing you can do from here will fix it.
