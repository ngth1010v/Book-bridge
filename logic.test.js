// Run: node logic.test.js
const assert = require('assert');
const { metrics, suggestTransfers } = require('./logic.js');
const state = require('./seed.json');

const row = (id) => state.stock.find((r) => r.id === id);

// s2 needs 150 Tiếng Việt 1, has 90, 60 shipping -> short 60, gap 0.
assert.deepStrictEqual(
  [metrics(state, row('k5')).short, metrics(state, row('k5')).gap, metrics(state, row('k5')).available],
  [60, 0, 5], // shelf 6, one borrowed
);

const s = suggestTransfers(state);
// s1 has 25 spare Toán 1 -> s2 (gap 40).
assert.deepStrictEqual(s.find((x) => x.titleId === 'toan1'), { fromId: 's1', toId: 's2', titleId: 'toan1', qty: 25 });
// Every suggestion stays within the donor's surplus.
for (const x of s) {
  const donor = state.stock.find((r) => r.schoolId === x.fromId && r.titleId === x.titleId);
  assert.ok(x.qty <= metrics(state, donor).surplus);
}

// Once proposed, the same gap is not suggested again and the donor's surplus is reserved.
const after = { ...state, transfers: [{ id: 't', fromId: 's1', toId: 's2', titleId: 'toan1', qty: 25, status: 'proposed' }] };
assert.ok(!suggestTransfers(after).some((x) => x.titleId === 'toan1'));
assert.strictEqual(metrics(after, row('k2')).surplus, 0);

console.log('logic ok');
