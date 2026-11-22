/* =========================================================
   Cat Island – tugas & langkah kecil (subtugas)
   Data: [{ id, text, done, open, subs: [{ id, text, done }], createdAt }]
   Disimpan oleh proses utama ke %APPDATA%\cat-island\tasks.json
   ========================================================= */
let tasks = [];
let filter = 'all';                // all | open | done
const newIds = new Set();          // tugas baru -> animasi masuk
let refocusSub = null;             // id tugas yang input langkahnya perlu difokus lagi setelah render
const uid = () => Date.now() + Math.floor(Math.random() * 1000);
const saveTasks = () => api.saveTasks(tasks);

const progress = (t) => (t.subs.length ? t.subs.filter((s) => s.done).length / t.subs.length : t.done ? 1 : 0);
function toggleTask(t) { t.done = !t.done; t.subs.forEach((s) => { s.done = t.done; }); }
function syncParent(t) { if (t.subs.length) t.done = t.subs.every((s) => s.done); }

// klik dua kali untuk mengubah teks; Enter simpan, Esc batal
function editable(el, onCommit) {
  el.ondblclick = () => { el.contentEditable = 'true'; el.focus(); document.getSelection().selectAllChildren(el); };
  const finish = (commit) => {
    if (el.contentEditable !== 'true') return;
    el.contentEditable = 'false';
    const v = el.textContent.trim();
    if (commit && v) onCommit(v);
    renderTasks();
  };
  el.onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
  };
  el.onblur = () => finish(true);
}

function subEl(t, s) {
  const li = document.createElement('li');
  li.className = 'sub' + (s.done ? ' done' : '');
  li.innerHTML = `<button class="check sm">${ICON.check}</button><span class="text" title="Klik dua kali untuk mengubah"></span>
                  <button class="icon-btn del" title="Hapus langkah">${ICON.x}</button>`;
  const text = li.querySelector('.text');
  text.textContent = s.text;
  editable(text, (v) => { s.text = v; saveTasks(); });
  li.querySelector('.check').onclick = () => { s.done = !s.done; syncParent(t); saveTasks(); renderTasks(); };
  li.querySelector('.del').onclick = () => { t.subs = t.subs.filter((x) => x !== s); syncParent(t); saveTasks(); renderTasks(); };
  return li;
}

function taskEl(t) {
  const li = document.createElement('li');
  li.className = 'task' + (t.done ? ' done' : '') + (t.open ? ' open' : '') + (newIds.has(t.id) ? ' new' : '');
  const n = t.subs.length, nd = t.subs.filter((s) => s.done).length;
  li.innerHTML = `
    <div class="row">
      <button class="check" title="Tandai selesai">${ICON.check}</button>
      <div class="body">
        <span class="text" title="Klik dua kali untuk mengubah"></span>
        ${n ? `<div class="sub-meta"><div class="mini-bar"><i style="width:${(nd / n) * 100}%"></i></div><span>${nd}/${n} langkah</span></div>` : ''}
      </div>
      <button class="icon-btn chev-btn" title="${n ? 'Lihat langkah' : 'Pecah jadi langkah kecil'}">${ICON.chev}</button>
      <button class="icon-btn del" title="Hapus tugas">${ICON.x}</button>
    </div>
    <div class="subs-wrap"><div class="subs-inner">
      <ul class="subs"></ul>
      <form class="add-sub"><input placeholder="+ Tambah langkah kecil…" maxlength="100" autocomplete="off"></form>
    </div></div>`;

  const text = li.querySelector('.row .text');
  text.textContent = t.text;
  editable(text, (v) => { t.text = v; saveTasks(); });
  li.querySelector('.row .check').onclick = () => { toggleTask(t); saveTasks(); renderTasks(); };
  li.querySelector('.row .del').onclick = () => { tasks = tasks.filter((x) => x !== t); saveTasks(); renderTasks(); };
  li.querySelector('.chev-btn').onclick = () => {
    t.open = !t.open; li.classList.toggle('open', t.open); saveTasks();
    if (t.open && !t.subs.length) setTimeout(() => li.querySelector('.add-sub input').focus(), 150);
  };

  const ul = li.querySelector('.subs');
  for (const s of t.subs) ul.appendChild(subEl(t, s));

  li.querySelector('.add-sub').onsubmit = (e) => {
    e.preventDefault();
    const v = e.target.querySelector('input').value.trim();
    if (!v) return;
    t.subs.push({ id: uid(), text: v, done: false });
    t.done = false; t.open = true;
    refocusSub = t.id;
    saveTasks(); renderTasks();
  };
  return li;
}

function renderSummary() {
  const total = tasks.length;
  const done = tasks.filter((t) => t.done).length;
  const frac = total ? tasks.reduce((a, t) => a + progress(t), 0) / total : 0;
  $('ringLabel').textContent = $('miniCount').textContent = `${done}/${total}`;
  $('ring').style.strokeDashoffset = 94.25 * (1 - frac);
  $('pct').textContent = Math.round(frac * 100) + '%';
  $('pctBar').style.width = frac * 100 + '%';
  // belum ada tugas: sembunyikan penghitung di notch & ringkas tombol tugas di pil
  $('miniCount').hidden = total === 0;
  $('toggle').classList.toggle('empty', total === 0);

  const next = tasks.find((t) => !t.done);
  const nextSub = next?.subs.find((s) => !s.done);
  $('nextLabel').textContent = nextSub ? next.text : 'Tugas berikutnya';
  $('nextTask').textContent = nextSub ? '↳ ' + nextSub.text : next ? next.text : total ? 'Semua selesai! 🎉' : 'Belum ada tugas';
  $('summary').textContent = total ? `${done} dari ${total} tugas selesai` : '';
  $('clearDone').style.visibility = done ? 'visible' : 'hidden';
}

function renderTasks() {
  const list = $('list');
  const keepScroll = list.scrollTop;
  list.innerHTML = '';
  const shown = tasks.filter((t) => filter === 'all' || (filter === 'done' ? t.done : !t.done));
  if (!shown.length) list.innerHTML = `<li class="empty">${ICON.eyes}${tasks.length ? 'Tidak ada tugas di sini' : 'Belum ada tugas — santai dulu'}</li>`;
  for (const t of shown) list.appendChild(taskEl(t));
  newIds.clear();
  list.scrollTop = keepScroll;
  if (refocusSub) {
    list.children[shown.findIndex((t) => t.id === refocusSub)]?.querySelector('.add-sub input')?.focus({ preventScroll: true });
    refocusSub = null;
  }
  renderSummary();
}

$('addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('newTask').value.trim();
  if (!v) return;
  const t = { id: uid(), text: v, done: false, open: false, subs: [], createdAt: Date.now() };
  tasks.push(t); newIds.add(t.id);
  $('newTask').value = '';
  saveTasks(); renderTasks();
});

document.querySelectorAll('.tabs button').forEach((b, i) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  b.parentElement.dataset.i = i;
  filter = b.dataset.filter; renderTasks();
}));

$('clearDone').addEventListener('click', () => { tasks = tasks.filter((t) => !t.done); saveTasks(); renderTasks(); });

function loadTasks() {
  return api.loadTasks().then((t) => {
    tasks = (Array.isArray(t) ? t : []).map((x) => ({ open: false, subs: [], ...x }));
    renderTasks();
  });
}
