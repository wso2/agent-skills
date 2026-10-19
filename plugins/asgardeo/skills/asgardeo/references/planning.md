# Writing the plan (Gate 2)

The plan is what the user approves before anything is created. It lists **what will exist**,
not values that only come into being on creation — a generated password, a client ID, a
resource ID all belong in the summary afterwards, not here.

## Three headings

1. **What I'll create** — the Asgardeo resources, as tables (below).
2. **What changes in your code** — the files.
3. **How you'll know it worked** — the check the user will run.

## One small table per kind of resource

Each table carries only the columns that belong to that kind, so every value is findable at a
glance. One wide table with blanks where a column doesn't apply hides the values the user is
checking.

**Application**

| Type | Name | Redirect URI | Access token |
|---|---|---|---|
| `spa` | orders-web | `http://localhost:5173` | Opaque (default) |

**Test user**

| Email (username) | Name |
|---|---|
| dev.tester@example.com | Dev Tester |

One resource with two or three settings reads better as a line. Reach for a table when there
are several values to check, or more than one of a kind.

## Scopes and roles (Track B)

Before creating them, show the scopes — name, and what it lets someone do. After the roles
exist, show each role with the scopes it carries, so the reader sees which role grants what.
These are the two things the user has to check are right, and a sentence hides the mapping.

| Scope | Lets the holder… |
|---|---|
| `read:orders` | list and view orders |
| `write:orders` | create and edit orders |

| Role | Scopes |
|---|---|
| `orders-viewer` | `read:orders` |
| `orders-admin` | `read:orders`, `write:orders` |
