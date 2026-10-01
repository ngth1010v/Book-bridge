// BookBridge web app. Runs in two modes, picked automatically at load:
//  - "api":   served by server.py -> data in SQLite via /api/*
//  - "local": static hosting (GitHub Pages) -> data in localStorage, seeded from seed.json
// Both modes expose the same store interface: { mode, state, add(coll, row), update(coll, id, patch) }.

const EBOOK_URL = 'https://taphuan.nxbgd.vn/'; // official free e-textbooks of NXB Giao duc Viet Nam; verify it matches the textbook series in use
const LOCAL_KEY = 'bookbridge-state-v2'; // bump when seed.json changes shape or content
const MY_LOANS_KEY = 'bookbridge-my-loans';

const $main = document.getElementById('main');
let store;
let lastView = null;

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const S = () => store.state;
const find = (coll, id) => S()[coll].find((x) => x.id === id) || { name: '(không rõ)' };
const title = (id) => find('titles', id).name;
const schoolName = (id) => find('schools', id).name;
const fmtDate = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('vi-VN') : '-');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const total = (rows, key) => rows.reduce((t, r) => t + r[key], 0);

function storageGet(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode: keep in memory */ } }

const ICONS = {
  school: '<path d="M3 21h18"/><path d="M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
};
const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

const SHIP = { planned: ['Đã lên lịch', 'info'], shipping: ['Đang giao', 'warn'], delivered: ['Đã nhận', 'ok'] };
const TRANSFER = { proposed: ['Chờ trường gửi đồng ý', 'info'], accepted: ['Đã đồng ý, chờ nhận', 'warn'], rejected: ['Bị từ chối', 'bad'], done: ['Hoàn tất', 'ok'] };
const LOAN = { requested: ['Chờ duyệt', 'info'], borrowed: ['Đang mượn', 'warn'], returned: ['Đã trả', 'ok'], rejected: ['Từ chối', 'bad'] };
const badge = (map, status) => `<span class="badge badge-${map[status][1]}">${map[status][0]}</span>`;

function table(headers, rows, empty) {
  if (!rows.length) return `<div class="table-wrap"><p class="empty">${empty}</p></div>`;
  const th = headers.map((h) => `<th${h.startsWith('#') ? ' class="num"' : ''}>${h.replace('#', '')}</th>`).join('');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
const tabs = (base, current, list) => `<div class="tabs" role="tablist">${list.map(([key, label]) =>
  `<button role="tab" aria-selected="${key === current}" data-action="tab" data-hash="${base}/${key}">${label}</button>`).join('')}</div>`;

let toastTimer;
function toast(message, isError) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
}

// ---------- stores ----------
async function api(method, path, body) {
  const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function makeStore() {
  try {
    if ((await api('GET', 'api/health')).ok) {
      const state = await api('GET', 'api/state');
      return {
        mode: 'api', state,
        async add(coll, row) { const saved = await api('POST', `api/${coll}`, row); state[coll].push(saved); return saved; },
        async update(coll, id, patch) { return Object.assign(state[coll].find((x) => x.id === id), await api('PATCH', `api/${coll}/${id}`, patch)); },
      };
    }
  } catch { /* no backend: fall through to local mode */ }
  const state = storageGet(LOCAL_KEY) || await (await fetch('seed.json')).json();
  const save = () => storageSet(LOCAL_KEY, state);
  save();
  return {
    mode: 'local', state,
    async add(coll, row) { const saved = { id: uid(), ...row }; state[coll].push(saved); save(); return saved; },
    async update(coll, id, patch) { const row = Object.assign(state[coll].find((x) => x.id === id), patch); save(); return row; },
  };
}

// ponytail: multi-step changes (e.g. receive transfer = status + two stock rows) are separate
// requests, not one transaction; move them into a server endpoint if concurrent edits appear.
async function adjustStock(schoolId, titleId, delta) {
  const row = S().stock.find((r) => r.schoolId === schoolId && r.titleId === titleId);
  if (row) return store.update('stock', row.id, { have: Math.max(0, row.have + delta) });
  return store.add('stock', { schoolId, titleId, need: 0, have: Math.max(0, delta), shelf: 0 });
}

// ---------- views ----------
function homeView() {
  const schoolOptions = S().schools.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  const supplierOptions = S().suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
  const card = (role, iconName, heading, text, options, label) => `
    <form class="role-card" data-form="enter" data-role="${role}">
      <div><h2 class="h3">${icon(iconName)}${heading}</h2><p>${text}</p></div>
      <div class="role-enter">
        <div class="field"><label for="enter-${role}">${label}</label><select id="enter-${role}" name="id">${options}</select></div>
        <button class="btn btn-primary" type="submit">Vào</button>
      </div>
    </form>`;
  return `
    <h1>Chọn vai trò</h1>
    <p class="muted">Ứng dụng giúp luân chuyển các bản sách giáo khoa in hợp pháp đến đúng nơi đang thiếu. Ứng dụng không lưu và không phát tán nội dung sách.
      <a href="#about">Ứng dụng này giải quyết vấn đề gì?</a></p>
    <div class="role-cards">
      ${card('school', 'school', 'Nhà trường', 'Cập nhật nhu cầu và số sách hiện có, nhận lô giao, xin sách dư từ trường khác, quản lý tủ sách mượn luân phiên.', schoolOptions, 'Trường của bạn')}
      ${card('parent', 'users', 'Phụ huynh / Học sinh', 'Xem sách của trường đã về chưa, đọc bản điện tử từ nguồn chính thức, đăng ký mượn sách luân phiên.', schoolOptions, 'Trường của con')}
      ${card('supplier', 'truck', 'Nhà xuất bản / Phân phối', 'Xem nhu cầu còn thiếu của từng trường và lên lịch giao sách.', supplierOptions, 'Đơn vị của bạn')}
    </div>
    <div class="callout">
      <strong>Bản demo chưa có đăng nhập.</strong> Khi triển khai thật: nhà trường và nhà xuất bản/phân phối dùng tài khoản và mật khẩu.
      Phụ huynh và học sinh không cần tài khoản, nhưng chỉ xem được trạng thái sách của trường mình, không thấy số liệu chi tiết.
    </div>
    ${store.mode === 'local' ? `<p class="small muted">Dữ liệu demo lưu trên trình duyệt này.
      <button class="btn btn-sm" data-action="reset">Khôi phục dữ liệu mẫu</button></p>` : ''}`;
}

// About page (#about): what the app is for, with region-wide numbers and live examples from current data.
function aboutView() {
  const all = S().stock.map((r) => ({ ...r, ...Logic.metrics(S(), r) }));
  const suggestions = Logic.suggestTransfers(S());
  const cover = (schoolId) => total(suggestions.filter((x) => x.toId === schoolId), 'qty');
  const worst = S().schools.map((s) => {
    const rows = all.filter((r) => r.schoolId === s.id);
    return { ...s, short: total(rows, 'short'), incoming: total(rows, 'incoming'), cover: cover(s.id) };
  }).filter((s) => s.short).sort((a, b) => b.short - a.short).slice(0, 5);
  const best = [...suggestions].sort((a, b) => b.qty - a.qty)[0];
  const waiting = all.find((r) => r.short && r.incoming);
  const supplier = S().suppliers[0];
  const problem = (heading, text) => `<div><h3>${heading}</h3><p>${text}</p></div>`;
  return `
    <div class="page-head"><div><p class="eyebrow">Giới thiệu</p><h1>Ứng dụng điều phối sách giáo khoa</h1></div>
      <a class="btn btn-sm" href="#">Chọn vai trò</a></div>
    <p class="muted">Ứng dụng giúp luân chuyển các bản sách giáo khoa in hợp pháp đến đúng nơi đang thiếu. Chi tiết về giải pháp có trong <a href="index.html#ung-dung">Chương 4 của báo cáo</a>.</p>

    <section class="home-section">
      <h2 class="h3">Ứng dụng giải quyết ba vấn đề</h2>
      <div class="rows">
        ${problem('Không ai thấy trường nào thiếu đầu sách nào', 'Mỗi trường nhập ba con số cho mỗi đầu sách: cần, đang có, để trong tủ mượn. Ứng dụng tính số thiếu, số đang về và số dư của từng trường.')}
        ${problem('Sách dư ở trường này, trường bên cạnh lại thiếu', 'Ứng dụng tự ghép trường dư với trường thiếu cùng đầu sách, ưu tiên cùng khu vực. Hai trường đồng ý với nhau, không cần in thêm cuốn nào.')}
        ${problem('Phụ huynh không biết khi nào có sách', 'Phụ huynh xem được đầu sách nào đã đủ, đầu sách nào đang về và ngày dự kiến. Trong lúc chờ, phụ huynh đăng ký mượn luân phiên hoặc mở sách điện tử chính thức.')}
      </div>
    </section>

    <section class="home-section">
      <h2 class="h3">Tình hình toàn vùng (dữ liệu mẫu)</h2>
      <div class="stats">
        <div class="stat"><b>${S().schools.length}</b><span>Trường tham gia</span></div>
        <div class="stat"><b>${total(all, 'short')}</b><span>Cuốn còn thiếu</span></div>
        <div class="stat"><b>${total(suggestions, 'qty')}</b><span>Bù được bằng sách dư</span></div>
        <div class="stat"><b>${total(all, 'incoming')}</b><span>Đang trên đường về</span></div>
      </div>
      ${table(['Trường thiếu nhiều nhất', 'Khu vực', '#Thiếu', '#Đang về', '#Bù được từ trường dư', ''], worst.map((s) => `<tr>
        <td>${esc(s.name)}</td><td>${esc(s.area)}</td><td class="num"><span class="badge badge-bad">${s.short}</span></td>
        <td class="num">${s.incoming}</td><td class="num">${s.cover}</td>
        <td><a class="btn btn-sm" href="#school/${s.id}">Xem trường</a></td></tr>`), 'Không còn trường nào thiếu sách.')}
    </section>

    <section class="home-section">
      <h2 class="h3">Thử ba tình huống</h2>
      <ol class="steps">
        ${best ? `<li><strong>Trường thiếu tìm trường dư.</strong> ${esc(schoolName(best.toId))} thiếu ${esc(title(best.titleId))}, trong khi ${esc(schoolName(best.fromId))} đang dư ${best.qty} cuốn.
          <a href="#school/${best.toId}/transfer">Mở tab điều phối của trường</a> rồi bấm “Gửi đề nghị”.</li>` : ''}
        ${waiting ? `<li><strong>Phụ huynh xem khi nào sách về.</strong> ${esc(schoolName(waiting.schoolId))} còn thiếu ${esc(title(waiting.titleId))} và lô giao đang trên đường.
          <a href="#parent/${waiting.schoolId}">Xem với vai trò phụ huynh</a>.</li>` : ''}
        <li><strong>Đơn vị cung ứng biết giao ở đâu.</strong> <a href="#supplier/${supplier.id}/demand">Mở danh sách nhu cầu</a>, đã trừ phần bù được bằng sách dư, rồi lên lịch giao.</li>
      </ol>
    </section>`;
}

function schoolView(id, tab = 'stock') {
  const school = find('schools', id);
  if (!school.id) return notFound();
  const rows = S().stock.filter((r) => r.schoolId === id);
  const m = new Map(rows.map((r) => [r.id, Logic.metrics(S(), r)]));
  const ms = [...m.values()];
  const pendingIn = S().transfers.filter((t) => t.fromId === id && t.status === 'proposed').length;
  const loanReqs = S().loans.filter((l) => l.schoolId === id && l.status === 'requested').length;
  const base = `#school/${id}`;

  let panel;
  if (tab === 'stock') {
    panel = `
      <p class="muted small">Cần: số học sinh cần sách. Đang có: số sách trường đang giữ, gồm cả sách trong tủ luân phiên. Tủ luân phiên: số cuốn để cho học sinh mượn theo lượt.</p>
      ${table(['Đầu sách', '#Cần', '#Đang có', '#Tủ luân phiên', '#Thiếu', '#Đang về', '#Dư', ''], rows.map((r) => {
        const x = m.get(r.id);
        const num = (name, label) => `<td class="num"><input type="number" min="0" name="${name}" value="${r[name]}" aria-label="${label}: ${esc(title(r.titleId))}"></td>`;
        return `<tr data-row="${r.id}"><td>${esc(title(r.titleId))}</td>${num('need', 'Cần')}${num('have', 'Đang có')}${num('shelf', 'Tủ luân phiên')}
          <td class="num">${x.short ? `<span class="badge badge-bad">${x.short}</span>` : '0'}</td>
          <td class="num">${x.incoming}</td><td class="num">${x.surplus}</td>
          <td><button class="btn btn-sm" data-action="save-stock" data-id="${r.id}">Lưu</button></td></tr>`;
      }), 'Chưa có đầu sách nào.')}`;
  } else if (tab === 'ship') {
    const list = S().shipments.filter((p) => p.schoolId === id).sort((a, b) => a.eta.localeCompare(b.eta));
    panel = table(['Đầu sách', '#Số lượng', 'Đơn vị cung ứng', 'Dự kiến', 'Trạng thái', ''], list.map((p) => `<tr>
      <td>${esc(title(p.titleId))}</td><td class="num">${p.qty}</td><td>${esc(find('suppliers', p.supplierId).name)}</td>
      <td>${fmtDate(p.eta)}</td><td>${badge(SHIP, p.status)}</td>
      <td>${p.status !== 'delivered' ? `<button class="btn btn-sm btn-primary" data-action="receive-shipment" data-id="${p.id}">Xác nhận đã nhận</button>` : ''}</td></tr>`),
      'Chưa có lô giao nào cho trường.');
  } else if (tab === 'transfer') {
    const suggestions = Logic.suggestTransfers(S()).filter((x) => x.toId === id);
    const asked = S().transfers.filter((t) => t.fromId === id);
    const mine = S().transfers.filter((t) => t.toId === id);
    panel = `
      <section><h2>Gợi ý: trường khác đang dư sách bạn cần</h2>
      ${table(['Đầu sách', 'Trường đang dư', '#Số lượng', ''], suggestions.map((x) => `<tr>
        <td>${esc(title(x.titleId))}</td><td>${esc(schoolName(x.fromId))}</td><td class="num">${x.qty}</td>
        <td><button class="btn btn-sm btn-primary" data-action="request-transfer" data-from="${x.fromId}" data-title="${x.titleId}" data-qty="${x.qty}">Gửi đề nghị</button></td></tr>`),
        'Không có gợi ý. Trường chưa thiếu sách, hoặc chưa trường nào dư đầu sách bạn cần.')}</section>
      <section><h2>Trường khác xin sách dư của bạn</h2>
      ${table(['Đầu sách', 'Trường xin', '#Số lượng', 'Trạng thái', ''], asked.map((t) => `<tr>
        <td>${esc(title(t.titleId))}</td><td>${esc(schoolName(t.toId))}</td><td class="num">${t.qty}</td><td>${badge(TRANSFER, t.status)}</td>
        <td class="row-actions">${t.status === 'proposed' ? `<button class="btn btn-sm btn-primary" data-action="accept-transfer" data-id="${t.id}">Đồng ý</button>
          <button class="btn btn-sm btn-danger" data-action="reject-transfer" data-id="${t.id}">Từ chối</button>` : ''}</td></tr>`),
        'Chưa có đề nghị nào.')}</section>
      <section><h2>Đề nghị của trường bạn</h2>
      ${table(['Đầu sách', 'Từ trường', '#Số lượng', 'Trạng thái', ''], mine.map((t) => `<tr>
        <td>${esc(title(t.titleId))}</td><td>${esc(schoolName(t.fromId))}</td><td class="num">${t.qty}</td><td>${badge(TRANSFER, t.status)}</td>
        <td>${t.status === 'accepted' ? `<button class="btn btn-sm btn-primary" data-action="receive-transfer" data-id="${t.id}">Xác nhận đã nhận</button>` : ''}</td></tr>`),
        'Chưa gửi đề nghị nào.')}</section>`;
  } else {
    const loans = S().loans.filter((l) => l.schoolId === id).sort((a, b) => Object.keys(LOAN).indexOf(a.status) - Object.keys(LOAN).indexOf(b.status));
    const available = (titleId) => {
      const r = rows.find((x) => x.titleId === titleId);
      return r ? m.get(r.id).available : 0;
    };
    panel = `
      <section><h2>Tủ sách luân phiên</h2>
      ${table(['Đầu sách', '#Trong tủ', '#Đang cho mượn', '#Còn sẵn'], rows.map((r) => `<tr><td>${esc(title(r.titleId))}</td>
        <td class="num">${r.shelf}</td><td class="num">${m.get(r.id).onLoan}</td><td class="num">${m.get(r.id).available}</td></tr>`), 'Chưa có đầu sách nào.')}</section>
      <section><h2>Yêu cầu mượn</h2>
      ${table(['Học sinh', 'Lớp', 'Đầu sách', 'Trạng thái', ''], loans.map((l) => `<tr>
        <td>${esc(l.student)}</td><td>${esc(l.className)}</td><td>${esc(title(l.titleId))}</td><td>${badge(LOAN, l.status)}</td>
        <td class="row-actions">${l.status === 'requested' ? `
          <button class="btn btn-sm btn-primary" data-action="loan" data-status="borrowed" data-id="${l.id}" ${available(l.titleId) ? '' : 'disabled title="Tủ đã hết sách này"'}>Cho mượn</button>
          <button class="btn btn-sm btn-danger" data-action="loan" data-status="rejected" data-id="${l.id}">Từ chối</button>` : ''}
          ${l.status === 'borrowed' ? `<button class="btn btn-sm" data-action="loan" data-status="returned" data-id="${l.id}">Đã trả</button>` : ''}</td></tr>`),
        'Chưa có yêu cầu mượn.')}</section>`;
  }

  return `
    <div class="page-head"><div><p class="eyebrow">Nhà trường · ${esc(school.area)}</p><h1>${esc(school.name)}</h1></div>
      <a class="btn btn-sm" href="#">Đổi vai trò</a></div>
    <div class="stats">
      <div class="stat"><b>${total(rows, 'need')}</b><span>Nhu cầu</span></div>
      <div class="stat"><b>${total(rows, 'have')}</b><span>Đang có</span></div>
      <div class="stat"><b>${total(ms, 'short')}</b><span>Còn thiếu</span></div>
      <div class="stat"><b>${total(ms, 'incoming')}</b><span>Đang về</span></div>
    </div>
    ${tabs(base, tab, [['stock', 'Sách & nhu cầu'], ['ship', 'Lô giao đến'], ['transfer', `Điều phối liên trường${pendingIn ? ` (${pendingIn})` : ''}`], ['loan', `Mượn luân phiên${loanReqs ? ` (${loanReqs})` : ''}`]])}
    <div class="panel">${panel}</div>`;
}

function parentView(id) {
  const school = find('schools', id);
  if (!school.id) return notFound();
  const rows = S().stock.filter((r) => r.schoolId === id);
  const myIds = storageGet(MY_LOANS_KEY) || [];
  const mine = S().loans.filter((l) => myIds.includes(l.id));
  const cards = rows.map((r) => {
    const x = Logic.metrics(S(), r);
    const eta = S().shipments.filter((p) => p.schoolId === id && p.titleId === r.titleId && p.status !== 'delivered').map((p) => p.eta).sort()[0];
    const status = !x.short ? '<span class="badge badge-ok">Đủ sách</span>'
      : x.incoming ? `<span class="badge badge-warn">Đang về${eta ? `, dự kiến ${fmtDate(eta)}` : ''}</span>`
        : '<span class="badge badge-bad">Đang thiếu</span>';
    const hint = x.short ? `<p class="small">${x.available ? `Thư viện còn ${x.available} cuốn để mượn luân phiên.` : 'Tủ luân phiên tạm hết. Bạn vẫn có thể đăng ký để được xếp lượt.'}</p>` : '';
    return `<div class="card"><h3>${esc(title(r.titleId))}</h3>${status}${hint}
      <p class="small"><a href="${EBOOK_URL}" target="_blank" rel="noopener">Đọc bản điện tử (nguồn chính thức)</a></p></div>`;
  }).join('');
  const options = rows.map((r) => `<option value="${r.titleId}">${esc(title(r.titleId))}</option>`).join('');
  return `
    <div class="page-head"><div><p class="eyebrow">Phụ huynh / Học sinh</p><h1>Sách của ${esc(school.name)}</h1></div>
      <a class="btn btn-sm" href="#">Đổi vai trò</a></div>
    <div class="panel">
    <div class="grid">${cards}</div>
    <section class="card">
      <h2 class="h3">Đăng ký mượn sách luân phiên</h2>
      <form data-form="loan" data-school="${id}" class="form-grid">
        <div class="field"><label for="loan-title">Đầu sách</label><select id="loan-title" name="titleId">${options}</select></div>
        <div class="field"><label for="loan-student">Họ tên học sinh</label><input id="loan-student" name="student" required maxlength="80" autocomplete="name"></div>
        <div class="field"><label for="loan-class">Lớp</label><input id="loan-class" name="className" required maxlength="20" placeholder="VD: 6A"></div>
        <button class="btn btn-primary" type="submit">Gửi đăng ký</button>
      </form>
      <p class="small muted">Chỉ cần tên và lớp. Nhà trường dùng thông tin này để xếp lượt mượn, không dùng cho mục đích khác.</p>
      ${mine.length ? table(['Học sinh', 'Đầu sách', 'Trạng thái'], mine.map((l) => `<tr><td>${esc(l.student)} (${esc(l.className)})</td><td>${esc(title(l.titleId))}</td><td>${badge(LOAN, l.status)}</td></tr>`), '') : ''}
    </section>
    <div class="callout"><strong>Trong lúc chờ sách:</strong> hỏi giáo viên chủ nhiệm về tủ sách dùng chung tại lớp, nhóm học đôi bạn và phiếu học tập của giáo viên.
      Đừng photocopy sách: việc này có thể vi phạm quyền tác giả.</div>
    </div>`;
}

function supplierView(id, tab = 'demand') {
  const supplier = find('suppliers', id);
  if (!supplier.id) return notFound();
  const suggestions = Logic.suggestTransfers(S());
  const gaps = S().stock.map((r) => ({ ...r, ...Logic.metrics(S(), r) })).filter((r) => r.gap > 0)
    .map((r) => ({ ...r, cover: suggestions.filter((x) => x.toId === r.schoolId && x.titleId === r.titleId).reduce((t, x) => t + x.qty, 0) }))
    .sort((a, b) => b.gap - a.gap);
  const mine = S().shipments.filter((p) => p.supplierId === id).sort((a, b) => a.eta.localeCompare(b.eta));
  const base = `#supplier/${id}`;
  const eta = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);

  const panel = tab === 'demand' ? `
    <p class="muted small">Số còn thiếu đã trừ sách đang giao và sách đã được điều phối giữa các trường. Cột "Có thể bù từ trường dư" là lượng sách dư ở trường khác đủ điều kiện luân chuyển. Nên để các trường xử lý phần này trước khi giao thêm.</p>
    ${table(['Trường', 'Khu vực', 'Đầu sách', '#Còn thiếu', '#Có thể bù từ trường dư', ''], gaps.map((r) => `<tr>
      <td>${esc(schoolName(r.schoolId))}</td><td>${esc(find('schools', r.schoolId).area)}</td><td>${esc(title(r.titleId))}</td>
      <td class="num"><span class="badge badge-bad">${r.gap}</span></td><td class="num">${r.cover}</td>
      <td><button class="btn btn-sm" data-action="prefill-ship" data-school="${r.schoolId}" data-title="${r.titleId}" data-qty="${Math.max(1, r.gap - r.cover)}">Lên lịch giao</button></td></tr>`),
      'Không còn trường nào thiếu sách.')}
    <form class="card" data-form="ship" data-supplier="${id}" id="ship-form">
      <h2>Tạo lô giao</h2>
      <div class="form-grid">
        <div class="field"><label for="ship-school">Trường</label><select id="ship-school" name="schoolId">${S().schools.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="ship-title">Đầu sách</label><select id="ship-title" name="titleId">${S().titles.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="ship-qty">Số lượng</label><input id="ship-qty" name="qty" type="number" min="1" max="100000" required value="10"></div>
        <div class="field"><label for="ship-eta">Ngày giao dự kiến</label><input id="ship-eta" name="eta" type="date" required value="${eta}"></div>
        <button class="btn btn-primary" type="submit">Tạo lô giao</button>
      </div>
    </form>`
    : table(['Trường', 'Đầu sách', '#Số lượng', 'Dự kiến', 'Trạng thái', ''], mine.map((p) => `<tr>
      <td>${esc(schoolName(p.schoolId))}</td><td>${esc(title(p.titleId))}</td><td class="num">${p.qty}</td><td>${fmtDate(p.eta)}</td><td>${badge(SHIP, p.status)}</td>
      <td>${p.status === 'planned' ? `<button class="btn btn-sm btn-primary" data-action="start-shipment" data-id="${p.id}">Bắt đầu giao</button>` : ''}</td></tr>`),
      'Đơn vị chưa có lô giao nào.');

  return `
    <div class="page-head"><div><p class="eyebrow">Nhà xuất bản / Phân phối</p><h1>${esc(supplier.name)}</h1></div>
      <a class="btn btn-sm" href="#">Đổi vai trò</a></div>
    <div class="stats">
      <div class="stat"><b>${total(gaps, 'gap')}</b><span>Cuốn còn thiếu (toàn vùng)</span></div>
      <div class="stat"><b>${new Set(gaps.map((r) => r.schoolId)).size}</b><span>Trường còn thiếu</span></div>
      <div class="stat"><b>${mine.filter((p) => p.status !== 'delivered').length}</b><span>Lô đang xử lý</span></div>
      <div class="stat"><b>${total(mine.filter((p) => p.status === 'delivered'), 'qty')}</b><span>Cuốn đã giao</span></div>
    </div>
    ${tabs(base, tab, [['demand', 'Nhu cầu cần giao'], ['ship', 'Lô giao của đơn vị']])}
    <div class="panel">${panel}</div>`;
}

const notFound = () => '<h1>Không tìm thấy</h1><p><a href="#">Quay lại chọn vai trò</a></p>';

function render() {
  const [role, id, tab] = location.hash.slice(1).split('/');
  const views = { school: schoolView, parent: parentView, supplier: supplierView };
  $main.innerHTML = role === 'about' ? aboutView() : views[role] && id ? views[role](id, tab) : homeView();
  const viewKey = `${role}/${id}`;
  $main.classList.remove('enter');
  if (viewKey !== lastView) {
    lastView = viewKey;
    $main.focus();
    window.scrollTo(0, 0);
    // Entrance only when the view changes (rare). Tab switches and saves re-render instantly.
    void $main.offsetWidth; // restart the CSS animation
    $main.classList.add('enter');
  }
}

// ---------- actions ----------
async function run(fn, message) {
  try {
    await fn();
    render();
    toast(message);
  } catch (e) {
    toast(`Lỗi: ${e.message}`, true);
  }
}

const actions = {
  tab: (d) => { location.hash = d.hash; },
  reset: () => { try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ } location.reload(); },
  'save-stock': (d, btn) => run(async () => {
    const tr = btn.closest('tr');
    const val = (name) => Number(tr.querySelector(`[name=${name}]`).value);
    const patch = { need: val('need'), have: val('have'), shelf: val('shelf') };
    if (Object.values(patch).some((v) => !Number.isInteger(v) || v < 0)) throw new Error('Số lượng phải là số nguyên không âm');
    if (patch.shelf > patch.have) throw new Error('Số sách trong tủ luân phiên không thể lớn hơn số sách đang có');
    await store.update('stock', d.id, patch);
  }, 'Đã lưu'),
  'receive-shipment': (d) => run(async () => {
    const p = await store.update('shipments', d.id, { status: 'delivered' });
    await adjustStock(p.schoolId, p.titleId, p.qty);
  }, 'Đã nhận lô sách, số sách đang có đã được cập nhật'),
  'start-shipment': (d) => run(() => store.update('shipments', d.id, { status: 'shipping' }), 'Đã chuyển sang Đang giao'),
  'request-transfer': (d) => run(() => store.add('transfers', {
    fromId: d.from, toId: location.hash.split('/')[1], titleId: d.title, qty: Number(d.qty), status: 'proposed',
  }), 'Đã gửi đề nghị đến trường đang dư sách'),
  'accept-transfer': (d) => run(() => store.update('transfers', d.id, { status: 'accepted' }), 'Đã đồng ý. Hãy chuyển sách cho trường nhận'),
  'reject-transfer': (d) => run(() => store.update('transfers', d.id, { status: 'rejected' }), 'Đã từ chối đề nghị'),
  'receive-transfer': (d) => run(async () => {
    const t = await store.update('transfers', d.id, { status: 'done' });
    await adjustStock(t.fromId, t.titleId, -t.qty);
    await adjustStock(t.toId, t.titleId, t.qty);
  }, 'Hoàn tất luân chuyển, số sách hai trường đã được cập nhật'),
  loan: (d) => run(() => store.update('loans', d.id, { status: d.status }), 'Đã cập nhật yêu cầu mượn'),
  'prefill-ship': (d) => {
    const form = document.getElementById('ship-form');
    form.schoolId.value = d.school;
    form.titleId.value = d.title;
    form.qty.value = d.qty;
    form.scrollIntoView({ block: 'center' });
    form.qty.focus();
  },
};

const forms = {
  enter: (form, data) => { location.hash = `${form.dataset.role}/${data.id}`; },
  loan: (form, data) => run(async () => {
    const saved = await store.add('loans', { schoolId: form.dataset.school, titleId: data.titleId, student: data.student.trim(), className: data.className.trim(), status: 'requested' });
    storageSet(MY_LOANS_KEY, [...(storageGet(MY_LOANS_KEY) || []), saved.id]);
  }, 'Đã gửi đăng ký mượn. Nhà trường sẽ xếp lượt'),
  ship: (form, data) => run(() => store.add('shipments', {
    supplierId: form.dataset.supplier, schoolId: data.schoolId, titleId: data.titleId, qty: Number(data.qty), eta: data.eta, status: 'planned',
  }), 'Đã tạo lô giao'),
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (btn && !btn.disabled) actions[btn.dataset.action](btn.dataset, btn);
});
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  forms[form.dataset.form](form, Object.fromEntries(new FormData(form)));
});
window.addEventListener('hashchange', render);

(async () => {
  try {
    store = await makeStore();
  } catch {
    $main.innerHTML = '<h1>Không tải được dữ liệu</h1><p>Hãy mở trang qua máy chủ web (ví dụ <code>python server.py</code>) thay vì mở trực tiếp tệp.</p>';
    return;
  }
  const mode = document.getElementById('mode');
  mode.textContent = store.mode === 'api' ? 'Đã kết nối máy chủ' : 'Demo · lưu trên trình duyệt';
  mode.className = `badge mode-badge ${store.mode === 'api' ? 'badge-ok' : 'badge-info'}`;
  render();
})();
