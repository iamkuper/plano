// Tenant isolation check against a running API (default http://localhost:3101,
// override with API_URL). Registers two workspaces, creates data in A and
// verifies that B can neither read nor change it.
//   node apps/api/test/isolation.mjs
const API = process.env.API_URL ?? "http://localhost:3101";
const run = Date.now().toString(36);
let failed = 0;

async function call(token, method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function check(name, ok, extra = "") {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` ${extra}`}`);
}
const denied = (r) => r.status === 404 || r.status === 400 || r.status === 403;

async function register(tag) {
  const r = await call(null, "POST", "/auth/register", {
    workspaceName: `Компания ${tag}`, name: `Админ ${tag}`, email: `${tag}-${run}@iso.test`, password: "password-123",
  });
  if (r.status !== 201) throw new Error(`register ${tag}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.accessToken;
}

const a = await register("a");
const b = await register("b");

// Data in A.
const tpl = (await call(a, "GET", "/templates")).body[0];
const project = (await call(a, "POST", "/projects", { title: "Секретный проект", templateId: tpl.id })).body;
const board = (await call(a, "GET", `/projects/${project.id}/board`)).body;
const card = board.columns[0].cards[0];
const column = board.columns[0];
const item = (await call(a, "POST", `/cards/${card.id}/checklist`, { text: "пункт" })).body;
const comment = (await call(a, "POST", `/cards/${card.id}/comments`, { text: "секрет" })).body;
const meA = (await call(a, "GET", "/users/me")).body;
const role = (await call(a, "POST", "/roles", { name: "Роль A", permissions: [] })).body;
check("A sees its project, card and numbering from 1", !!card && card.number >= 1 && card.number <= 7, JSON.stringify(card?.number));

// B sees nothing of A.
check("B: project list empty", (await call(b, "GET", "/projects")).body.length === 0);
check("B: project by id", denied(await call(b, "GET", `/projects/${project.id}`)));
check("B: project board", denied(await call(b, "GET", `/projects/${project.id}/board`)));
check("B: card by id", denied(await call(b, "GET", `/cards/${card.id}`)));
check("B: search finds nothing", (await call(b, "GET", "/cards/search?q=" + encodeURIComponent("Бриф"))).body.length === 0);
check("B: team board empty", (await call(b, "GET", "/team-board")).body.every((c) => c.cards.length === 0));
check("B: users are only B's", (await call(b, "GET", "/users")).body.every((u) => u.id !== meA.id));
check("B: roles are only B's", (await call(b, "GET", "/roles")).body.every((r) => r.id !== role.id));
check("B: templates are only B's", (await call(b, "GET", "/templates")).body.every((t) => t.id !== tpl.id));
check("B: time report empty", (await call(b, "GET", "/reports/time?from=2020-01-01&to=2030-01-01")).body.length === 0);

// B cannot change A's data.
check("B: patch project", denied(await call(b, "PATCH", `/projects/${project.id}`, { title: "взлом" })));
check("B: patch card", denied(await call(b, "PATCH", `/cards/${card.id}`, { title: "взлом" })));
check("B: delete card", denied(await call(b, "DELETE", `/cards/${card.id}`)));
check("B: comment on card", denied(await call(b, "POST", `/cards/${card.id}/comments`, { text: "x" })));
check("B: checklist item on card", denied(await call(b, "POST", `/cards/${card.id}/checklist`, { text: "x" })));
check("B: patch checklist item", denied(await call(b, "PATCH", `/checklist/${item.id}`, { text: "x" })));
check("B: delete comment", denied(await call(b, "DELETE", `/comments/${comment.id}`)));
check("B: add time to card", denied(await call(b, "POST", `/cards/${card.id}/time`, { minutes: 10, date: "2026-01-01" })));
check("B: add column to A's board", denied(await call(b, "POST", `/boards/${board.id}/columns`, { title: "x" })));
check("B: patch A's column", denied(await call(b, "PATCH", `/columns/${column.id}`, { title: "x" })));
check("B: project from A's template", denied(await call(b, "POST", "/projects", { title: "x", templateId: tpl.id })));
check("B: patch A's user", denied(await call(b, "PATCH", `/users/${meA.id}`, { name: "x" })));
check("B: reset A's password", denied(await call(b, "POST", `/users/${meA.id}/password`, { password: "hacked-12345" })));
check("B: delete A's role", denied(await call(b, "DELETE", `/roles/${role.id}`)));

// B's own card cannot be given A's user, nor moved into A's column.
const bProj = (await call(b, "POST", "/projects", { title: "Проект B" })).body;
const bBoard = (await call(b, "GET", `/projects/${bProj.id}/board`)).body;
const bCol = bBoard.columns[0];
const bCard = (await call(b, "POST", "/cards", { columnId: bCol.id, title: "карточка B" })).body;
check("B: own card numbered from 1", bCard.number === 1, String(bCard.number));
check("B: assign A's user", denied(await call(b, "POST", "/cards", { columnId: bCol.id, title: "x", assigneeIds: [meA.id] })));
check("B: card into A's column", denied(await call(b, "POST", "/cards", { columnId: column.id, title: "x" })));
check("B: move own card to A's column", denied(await call(b, "POST", `/cards/${bCard.id}/move`, { columnId: column.id })));

// Labels.
const label = (await call(a, "POST", "/labels", { name: "Срочное", color: "red" })).body;
check("A creates a label", !!label.id);
check("B: labels list empty", (await call(b, "GET", "/labels")).body.length === 0);
check("B: same name is allowed in another workspace", (await call(b, "POST", "/labels", { name: "Срочное", color: "blue" })).status === 201);
check("B: patch A's label", denied(await call(b, "PATCH", `/labels/${label.id}`, { name: "x" })));
check("B: delete A's label", denied(await call(b, "DELETE", `/labels/${label.id}`)));
check("B: put A's label on own card", denied(await call(b, "PATCH", `/cards/${bCard.id}`, { labelIds: [label.id] })));
check("A: label on A's card", (await call(a, "PATCH", `/cards/${card.id}`, { labelIds: [label.id] })).body.labels?.[0]?.label.id === label.id);
check("B: sees no labels on A's card via search", (await call(b, "GET", "/cards/search?q=" + encodeURIComponent("Бриф"))).body.length === 0);

// A is untouched.
const after = (await call(a, "GET", `/cards/${card.id}`)).body;
check("A's card intact", after.title === card.title && after.checklist.length === card.checklist.length + 1 && after.comments.length === 1);
check("A's project intact", (await call(a, "GET", `/projects/${project.id}`)).body.title === "Секретный проект");
check("A's user intact", (await call(a, "POST", "/auth/login", { email: `a-${run}@iso.test`, password: "password-123" })).status === 201);

// Unauthenticated.
check("no token → 401", (await call(null, "GET", "/projects")).status === 401);

console.log(failed ? `\n${failed} check(s) failed` : "\nAll isolation checks passed");
process.exit(failed ? 1 : 0);
