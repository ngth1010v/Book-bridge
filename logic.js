// Pure derived-data helpers. Shared by app.js (browser) and logic.test.js (node).
(function (root) {
  const sum = (rows) => rows.reduce((total, r) => total + r.qty, 0);
  const OPEN_TRANSFER = ['proposed', 'accepted'];

  // Firm incoming books: undelivered shipments + transfers the donor already accepted.
  function incoming(state, schoolId, titleId) {
    return sum(state.shipments.filter((p) => p.schoolId === schoolId && p.titleId === titleId && p.status !== 'delivered'))
      + sum(state.transfers.filter((t) => t.toId === schoolId && t.titleId === titleId && t.status === 'accepted'));
  }

  function metrics(state, row) {
    const inc = incoming(state, row.schoolId, row.titleId);
    const promised = sum(state.transfers.filter((t) => t.fromId === row.schoolId && t.titleId === row.titleId && OPEN_TRANSFER.includes(t.status)));
    const requested = sum(state.transfers.filter((t) => t.toId === row.schoolId && t.titleId === row.titleId && t.status === 'proposed'));
    const onLoan = state.loans.filter((l) => l.schoolId === row.schoolId && l.titleId === row.titleId && l.status === 'borrowed').length;
    return {
      short: Math.max(0, row.need - row.have), // students without a book today
      incoming: inc,
      gap: Math.max(0, row.need - row.have - inc), // still uncovered after everything on the way
      open: Math.max(0, row.need - row.have - inc - requested), // uncovered and not yet asked for
      surplus: Math.max(0, row.have - row.need - promised),
      onLoan,
      available: Math.max(0, row.shelf - onLoan),
    };
  }

  // Match surplus to open gaps per title, same-area donors first.
  // ponytail: greedy in stock order, not globally optimal; fine for tens of schools.
  function suggestTransfers(state) {
    const area = (id) => (state.schools.find((s) => s.id === id) || {}).area;
    const left = new Map(state.stock.map((r) => [r.id, metrics(state, r).surplus]));
    const out = [];
    for (const r of state.stock) {
      let want = metrics(state, r).open;
      if (want <= 0) continue;
      const same = (d) => (area(d.schoolId) === area(r.schoolId) ? 1 : 0);
      const donors = state.stock
        .filter((d) => d.titleId === r.titleId && d.schoolId !== r.schoolId && left.get(d.id) > 0)
        .sort((a, b) => same(b) - same(a) || left.get(b.id) - left.get(a.id));
      for (const d of donors) {
        if (want <= 0) break;
        const qty = Math.min(want, left.get(d.id));
        left.set(d.id, left.get(d.id) - qty);
        want -= qty;
        out.push({ fromId: d.schoolId, toId: r.schoolId, titleId: r.titleId, qty });
      }
    }
    return out;
  }

  root.Logic = { incoming, metrics, suggestTransfers };
  if (typeof module !== 'undefined') module.exports = root.Logic;
})(typeof window !== 'undefined' ? window : globalThis);
