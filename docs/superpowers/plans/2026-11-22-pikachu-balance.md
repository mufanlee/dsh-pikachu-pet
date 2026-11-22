# 皮卡丘桌宠账户余额实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在皮卡丘桌宠下方显示 DeepSeek 账户余额小标签，支持明细、登录态监听、60 秒/任务完成刷新与错误降级。

**Architecture:** 仅改 Client 半。新增模块级 `createBalanceStore(ctx)` 管理 `getBalance` 金额与 `remote.account.watch` 登录态；`PetLive` 渲染 `BalanceChip`。host 半与 `index.js` 不变。

**Tech Stack:** 原生 JS、React（宿主注入）、DSH Client `ctx.remote`/`ctx.remoteAccess`/`ctx.locale`、现有 `src/build-client.cjs` 与 `src/verify-client.cjs`。

---

### Task 1: 余额纯函数与可测试出口

**Files:**
- Modify: `src/client.template.js`（`POSE_SETS` 之后、`CRY_CLIPS` 之前）
- Test: `src/verify-client.cjs`

- [ ] **Step 1: 在 verify 里写失败测试**

将 `src/verify-client.cjs` 第 106 行的 `const plugin = ...` 改为外层可访问，并在 smoke test 后追加：

```js
let plugin = null;
// ... inside try: plugin = definition.factory(requireStub);

const testApi = (plugin && plugin.__test) || {};
check(typeof testApi.formatWallet === 'function', 'missing __test.formatWallet');
check(typeof testApi.pickPrimaryWallet === 'function', 'missing __test.pickPrimaryWallet');
check(testApi.formatWallet({ currency: 'CNY', balance: '12.34' }, 'zh-CN').includes('12.34'), 'CNY formatting failed');
check(testApi.formatWallet({ currency: 'USD', balance: '3.5' }, 'en-US').includes('3.50'), 'USD formatting failed');
check(testApi.formatWallet({ currency: 'CNY', balance: 'oops' }, 'zh-CN') === 'oops', 'invalid amount should pass through');
check(testApi.pickPrimaryWallet([{ currency: 'USD', balance: '1' }, { currency: 'CNY', balance: '2' }]).currency === 'CNY', 'primary wallet should prefer CNY');
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run verify`
Expected: `verify FAILED` 含 `missing __test.formatWallet`

- [ ] **Step 3: 实现常量与纯函数**

在模板 `CRY_CLIPS` 之前加入：

```js
const FALLBACK_CLIENT_VERSION = '0.2.2-rc.5';
const BALANCE_POLL_MS = 60000;
const STREAM_RETRY_MS = 5000;
const STREAM_MAX_RETRIES = 3;

function clientVersion() {
  try {
    const boot = typeof window !== 'undefined' ? window.__DSH_BOOT__ : null;
    const version = boot && boot.release && boot.release.version;
    if (typeof version === 'string' && version.length > 0) return version;
  } catch (error) { /* noop */ }
  return FALLBACK_CLIENT_VERSION;
}

function localeId(ctx) {
  try {
    const locale = ctx && (ctx.locale || (typeof ctx.get === 'function' ? ctx.get('locale') : null));
    const snapshot = locale && typeof locale.getSnapshot === 'function' ? locale.getSnapshot() : null;
    if (snapshot && typeof snapshot.active === 'string' && snapshot.active) return snapshot.active;
  } catch (error) { /* noop */ }
  return 'zh-CN';
}

function formatWallet(wallet, locale) {
  if (!wallet || typeof wallet.balance !== 'string') return '';
  const currency = wallet.currency === 'USD' ? 'USD' : 'CNY';
  const amount = Number(wallet.balance.replace(/,/g, ''));
  if (!Number.isFinite(amount)) return wallet.balance;
  try {
    return new Intl.NumberFormat(locale || 'zh-CN', { style: 'currency', currency: currency }).format(amount);
  } catch (error) {
    return (currency === 'USD' ? '$' : '¥') + amount.toFixed(2);
  }
}

function pickPrimaryWallet(wallets) {
  if (!Array.isArray(wallets) || wallets.length === 0) return null;
  for (let index = 0; index < wallets.length; index += 1) {
    if (wallets[index] && wallets[index].currency === 'CNY') return wallets[index];
  }
  return wallets[0] || null;
}
```

并在模块返回值加入测试出口：

```js
return {
  inject: ['slots'],
  apply(ctx) { /* ... */ },
  __test: {
    clientVersion: clientVersion,
    formatWallet: formatWallet,
    pickPrimaryWallet: pickPrimaryWallet,
  },
};
```

- [ ] **Step 4: 运行确认通过**

Run: `npm run verify`
Expected: `verify OK: ...`

- [ ] **Step 5: 提交**

```bash
git add src/client.template.js src/verify-client.cjs client.js
git commit -m "feat: add balance formatting helpers"
```

### Task 2: 余额 Store 与登录态流

**Files:**
- Modify: `src/client.template.js`（纯函数之后、`PetLive` 之前）
- Modify: `src/verify-client.cjs`（stub `ctx.remote`）

- [ ] **Step 1: 写 store 失败测试（静态 + 冒烟）**

在 verify 的 smoke test 中给 `plugin.apply` 的 ctx 增加：

```js
remote: {
  account: {
    getBalance: async () => ({ ok: true, value: { status: 'ready', value: [{ currency: 'CNY', balance: '12.34' }], bonusWallets: [] } }),
    watch: async function* () {},
  },
  $stream: () => ({ dispose() {}, [Symbol.asyncIterator]: async function* () {} }),
},
```

并在 smoke test 后追加：

```js
check(/account\.getBalance/.test(built.source), 'client.js should call account.getBalance');
check(/account\.watch/.test(built.source), 'client.js should watch account state');
```

- [ ] **Step 2: 运行确认失败**

Run: `npm run verify`
Expected: FAIL（`client.js should call account.getBalance`）

- [ ] **Step 3: 实现 createBalanceStore**

在 `pickPrimaryWallet` 之后加入（完整实现）：

```js
function getAccountService(ctx) {
  try {
    if (ctx && ctx.remote && ctx.remote.account) return ctx.remote.account;
    if (ctx && typeof ctx.get === 'function') return ctx.get('remote.account') || null;
  } catch (error) { /* noop */ }
  return null;
}

function createBalanceStore(ctx) {
  const account = getAccountService(ctx);
  const listeners = new Set();
  let state = {
    phase: account ? 'loading' : 'unavailable',
    wallets: [],
    bonusWallets: [],
    updatedAt: 0,
    stale: false,
    error: '',
  };
  let disposed = false;
  let timer = null;
  let stream = null;
  let watchDispose = null;
  let retries = 0;
  let refreshPromise = null;

  function emit(patch) {
    state = Object.assign({}, state, patch);
    listeners.forEach(function (listener) {
      try { listener(); } catch (error) { /* noop */ }
    });
  }

  function getSnapshot() { return state; }

  function subscribe(listener) {
    listeners.add(listener);
    return function () { listeners.delete(listener); };
  }

  function requestMeta() {
    return {
      version: clientVersion(),
      locale: localeId(ctx),
      timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
    };
  }

  function refresh() {
    if (disposed || !account) return Promise.resolve();
    if (refreshPromise) return refreshPromise;
    refreshPromise = Promise.resolve()
      .then(function () { return account.getBalance(requestMeta()); })
      .then(function (result) {
        if (disposed) return;
        if (!result || result.ok !== true) throw new Error('balance request failed');
        const value = result.value;
        if (value == null) {
          emit({ phase: 'signed-out', wallets: [], bonusWallets: [], updatedAt: Date.now(), stale: false, error: '' });
          return;
        }
        if (value.status !== 'ready') throw new Error('balance unavailable');
        emit({
          phase: 'ready',
          wallets: Array.isArray(value.value) ? value.value.slice() : [],
          bonusWallets: Array.isArray(value.bonusWallets) ? value.bonusWallets.slice() : [],
          updatedAt: Date.now(),
          stale: false,
          error: '',
        });
      })
      .catch(function (error) {
        if (disposed) return;
        const keep = state.phase === 'ready';
        emit({
          phase: keep ? 'ready' : 'error',
          stale: keep,
          error: error && error.message ? error.message : 'balance request failed',
        });
      })
      .then(function () { refreshPromise = null; });
    return refreshPromise;
  }

  function handleFrame(frame) {
    if (!frame || !frame.state) return;
    if (frame.state.status === 'signed-out') {
      emit({ phase: 'signed-out', wallets: [], bonusWallets: [], updatedAt: Date.now(), stale: false, error: '' });
      return;
    }
    if (frame.type === 'credentials-changed' || state.phase === 'signed-out') refresh();
  }

  function consume(readable) {
    (async function () {
      try {
        for await (const frame of readable) {
          if (disposed) return;
          handleFrame(frame);
        }
      } catch (error) { /* $stream callbacks own end/failure */ }
    })();
  }

  function openStream() {
    return ctx.remote.$stream({
      name: 'account',
      open: function (signal) { return account.watch(signal); },
      ended: function () { stream = null; scheduleReconnect(); },
      carrierFailed: function () { /* polling stays in charge */ },
    });
  }

  function connect() {
    if (disposed || !account || typeof account.watch !== 'function') return;
    if (!ctx.remote || typeof ctx.remote.$stream !== 'function') return;
    try {
      const remoteAccess = typeof ctx.get === 'function' ? ctx.get('remoteAccess') : ctx.remoteAccess;
      if (remoteAccess && typeof remoteAccess.whenAccess === 'function') {
        watchDispose = remoteAccess.whenAccess('account/watch', function* () {
          const opened = openStream();
          stream = opened;
          consume(opened);
          yield function () {
            try { opened.dispose(); } catch (error) { /* noop */ }
            if (stream === opened) stream = null;
          };
        });
      } else {
        stream = openStream();
        consume(stream);
      }
    } catch (error) { /* polling remains */ }
  }

  function scheduleReconnect() {
    if (disposed || retries >= STREAM_MAX_RETRIES) return;
    retries += 1;
    (typeof window !== 'undefined' && window.setTimeout ? window.setTimeout : setTimeout)(function () {
      if (!disposed) connect();
    }, STREAM_RETRY_MS);
  }

  function onVisibilityChange() {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') refresh();
  }

  function start() {
    refresh();
    if (typeof window !== 'undefined' && typeof window.setInterval === 'function') {
      timer = window.setInterval(function () {
        if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
        refresh();
      }, BALANCE_POLL_MS);
    }
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    connect();
  }

  function dispose() {
    disposed = true;
    if (timer !== null) { clearInterval(timer); timer = null; }
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
    if (typeof watchDispose === 'function') {
      try { watchDispose(); } catch (error) { /* noop */ }
      watchDispose = null;
    }
    if (stream && typeof stream.dispose === 'function') {
      try { stream.dispose(); } catch (error) { /* noop */ }
    }
    stream = null;
    listeners.clear();
  }

  return { subscribe: subscribe, getSnapshot: getSnapshot, refresh: refresh, start: start, dispose: dispose };
}

let balanceStore = null;
let runtimeCtx = null;

function refreshBalance() {
  if (balanceStore) balanceStore.refresh();
}
```

- [ ] **Step 4: 在 apply 中启动 store**

```js
apply(ctx) {
  runtimeCtx = ctx;
  installLocale(ctx);
  ctx.effect(function () {
    balanceStore = createBalanceStore(ctx);
    balanceStore.start();
    return function () {
      balanceStore.dispose();
      balanceStore = null;
    };
  }, 'pikachu-pet: balance');
  // ... existing slot injections
},
```

并在 `__test` 中加 `createBalanceStore: createBalanceStore`。

- [ ] **Step 5: 运行验证**

Run: `npm run build && npm run verify`
Expected: `verify OK`，且 smoke test 的 `apply` 不抛错。

- [ ] **Step 6: 提交**

```bash
git add src/client.template.js src/verify-client.cjs client.js
git commit -m "feat: add balance store and account watch"
```

### Task 3: 余额标签、明细面板与文案

**Files:**
- Modify: `src/client.template.js`（`TEXT_EN`、`TEXT_ZH`、`CSS`、`PetLive`）
- Modify: `src/verify-client.cjs`（locale 键计数可选）

- [ ] **Step 1: 加 locale 文案**

`TEXT_EN`：

```js
balanceTitle: 'Account balance',
balanceTopUp: 'Top-up balance',
balanceBonus: 'Bonus balance',
balanceUpdated: 'Updated {time}',
balanceLoading: '···',
balanceSignedOut: 'Signed out',
balanceError: 'Balance unavailable',
balanceRetry: 'Retry',
balanceRefresh: 'Refresh',
balanceGoLogin: 'Sign in',
balanceLoginHint: 'Sign in to see your balance.',
balanceUnavailable: 'Balance is unavailable in this build.',
```

`TEXT_ZH`：

```js
balanceTitle: '账户余额',
balanceTopUp: '充值余额',
balanceBonus: '赠送余额',
balanceUpdated: '更新于 {time}',
balanceLoading: '···',
balanceSignedOut: '未登录',
balanceError: '余额读取失败',
balanceRetry: '重试',
balanceRefresh: '刷新',
balanceGoLogin: '去登录',
balanceLoginHint: '登录后即可查看余额。',
balanceUnavailable: '当前版本不支持账户余额。',
```

- [ ] **Step 2: 加 CSS**

在 `.pkp-pref-row` 之前插入：

```js
'.pkp-balance-wrap{position:relative;pointer-events:auto;margin-top:2px;line-height:0;}' +
'.pkp-balance-chip{min-width:58px;height:24px;padding:0 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,0.08));' +
'background:var(--pkp-bubble-bg);color:var(--dsw-alias-label-primary,#1f2329);font:600 12px/22px system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;' +
'cursor:pointer;box-shadow:0 4px 12px rgba(16,24,40,0.14);transition:opacity .18s ease,border-color .18s ease;}' +
'.pkp-balance-chip:hover{border-color:var(--dsw-alias-border-l2,rgba(0,0,0,0.16));}' +
'.pkp-balance-chip[data-phase="loading"]{opacity:.7;}' +
'.pkp-balance-chip[data-phase="error"],.pkp-balance-chip[data-phase="signed-out"]{color:var(--dsw-alias-label-secondary,#5b6472);}' +
'.pkp-balance-chip[data-stale="true"]{opacity:.6;}' +
'.pkp-balance-panel{position:absolute;right:calc(100% + 10px);bottom:0;width:212px;padding:10px 12px;border-radius:12px;' +
'background:var(--pkp-bubble-bg);border:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,0.08));box-shadow:0 12px 28px rgba(16,24,40,0.2);' +
'font:12px/1.5 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:var(--dsw-alias-label-primary,#1f2329);text-align:left;}' +
'.pkp-balance-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;font-weight:700;}' +
'.pkp-balance-refresh{border:0;background:none;color:var(--dsw-alias-label-secondary,#5b6472);cursor:pointer;font-size:14px;line-height:1;padding:2px 4px;border-radius:6px;}' +
'.pkp-balance-refresh:hover{background:var(--dsw-alias-bg-hover,rgba(0,0,0,0.05));}' +
'.pkp-balance-row{display:flex;justify-content:space-between;gap:12px;padding:2px 0;}' +
'.pkp-balance-row span:first-child{color:var(--dsw-alias-label-secondary,#5b6472);}' +
'.pkp-balance-note{margin-top:6px;color:var(--dsw-alias-label-secondary,#5b6472);font-size:11px;}' +
'.pkp-balance-action{margin-top:8px;border:0;border-radius:8px;padding:4px 10px;background:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff;cursor:pointer;font:600 12px/20px system-ui;}' +
'@media (max-width:760px){.pkp-balance-panel{right:0;bottom:calc(100% + 6px);width:196px;}}' +
```

- [ ] **Step 3: 实现 BalanceChip**

在 `PetLive` 之前加入：

```js
function openAccountSettings() {
  try {
    const layout = runtimeCtx && (runtimeCtx.layout || (typeof runtimeCtx.get === 'function' ? runtimeCtx.get('layout') : null));
    if (layout && typeof layout.selectPanel === 'function') layout.selectPanel('settings');
  } catch (error) { /* hint remains */ }
}

function useBalance() {
  const [snapshot, setSnapshot] = useState(function () {
    return balanceStore ? balanceStore.getSnapshot() : { phase: 'unavailable' };
  });
  useEffect(function () {
    if (!balanceStore) return undefined;
    setSnapshot(balanceStore.getSnapshot());
    return balanceStore.subscribe(function () { setSnapshot(balanceStore.getSnapshot()); });
  }, []);
  return snapshot;
}

function BalanceRow(props) {
  return h('div', { className: 'pkp-balance-row' },
    h('span', null, props.label),
    h('span', null, props.value));
}

function BalanceChip() {
  const state = useBalance();
  const [open, setOpen] = useState(false);
  if (!state || state.phase === 'unavailable') return null;

  const locale = localeId(runtimeCtx);
  const primary = pickPrimaryWallet(state.wallets);
  const label = state.phase === 'signed-out'
    ? translate('balanceSignedOut')
    : state.phase === 'loading'
      ? translate('balanceLoading')
      : state.phase === 'error'
        ? '—'
        : primary ? formatWallet(primary, locale) : '—';

  const time = state.updatedAt ? new Date(state.updatedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '';

  const rows = [];
  state.wallets.forEach(function (wallet, index) {
    rows.push(h(BalanceRow, {
      key: 'top-' + index,
      label: index === 0 ? translate('balanceTopUp') : '',
      value: formatWallet(wallet, locale),
    }));
  });
  state.bonusWallets.forEach(function (wallet, index) {
    rows.push(h(BalanceRow, {
      key: 'bonus-' + index,
      label: index === 0 ? translate('balanceBonus') : '',
      value: formatWallet(wallet, locale),
    }));
  });

  const panel = open
    ? h('div', {
      className: 'pkp-balance-panel',
      id: 'pkp-balance-panel',
      role: 'region',
      'aria-label': translate('balanceTitle'),
    },
    h('div', { className: 'pkp-balance-head' },
      h('span', null, translate('balanceTitle')),
      state.phase === 'ready'
        ? h('button', {
          className: 'pkp-balance-refresh',
          type: 'button',
          title: translate('balanceRefresh'),
          onClick: function (event) { event.stopPropagation(); refreshBalance(); },
        }, '↻')
        : null),
    state.phase === 'ready'
      ? h('div', null,
        rows.length ? rows : h('div', { className: 'pkp-balance-row' }, h('span', null, '—')),
        time ? h('div', { className: 'pkp-balance-note' }, translate('balanceUpdated').replace('{time}', time)) : null)
      : state.phase === 'signed-out'
        ? h('div', null,
          h('div', { className: 'pkp-balance-note' }, translate('balanceLoginHint')),
          h('button', {
            className: 'pkp-balance-action',
            type: 'button',
            onClick: function (event) { event.stopPropagation(); openAccountSettings(); },
          }, translate('balanceGoLogin')))
        : state.phase === 'error'
          ? h('div', null,
            h('div', { className: 'pkp-balance-note' }, translate('balanceError')),
            h('button', {
              className: 'pkp-balance-action',
              type: 'button',
              onClick: function (event) { event.stopPropagation(); refreshBalance(); },
            }, translate('balanceRetry')))
          : h('div', { className: 'pkp-balance-note' }, translate('balanceLoading')))
    : null;

  return h('div', {
    className: 'pkp-balance-wrap',
    onMouseEnter: function () { setOpen(true); },
    onMouseLeave: function () { setOpen(false); },
    onKeyDown: function (event) {
      if (event.key === 'Escape') setOpen(false);
    },
    onBlur: function (event) {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    },
  },
  h('button', {
    className: 'pkp-balance-chip',
    type: 'button',
    'data-phase': state.phase,
    'data-stale': state.stale ? 'true' : 'false',
    'aria-expanded': open,
    'aria-controls': 'pkp-balance-panel',
    title: state.stale ? translate('balanceError') : translate('balanceTitle'),
    onClick: function () { setOpen(!open); },
    onFocus: function () { setOpen(true); },
  }, label),
  panel);
}
```

- [ ] **Step 4: 在 PetLive 返回树末尾挂载**

在 `h('div', { className:'pkp-fx', ... })` 之后、`pkp-pet` 的右括号之后追加 `h(BalanceChip, null)`；即：

```js
h('div', { className: 'pkp-pet', /* ... */ },
  h('div', { className: 'pkp-stage' },
    h('img', { className: 'pkp-sprite', src: POSE_IMAGES[poseKey], alt: '', draggable: false }),
    h('div', { className: 'pkp-fx', dangerouslySetInnerHTML: { __html: FX } }))),
h(BalanceChip, null));
```

- [ ] **Step 5: 构建并验证**

Run: `npm run build && npm run verify`
Expected: `verify OK`

- [ ] **Step 6: 提交**

```bash
git add src/client.template.js client.js
git commit -m "feat: show account balance chip and detail panel"
```

### Task 4: 任务完成刷新、版本与 README

**Files:**
- Modify: `src/client.template.js`（庆祝 useEffect）
- Modify: `package.json`、`README.md`

- [ ] **Step 1: 庆祝时刷新余额**

在 `src/client.template.js:536-542` 的庆祝分支内、`setCelebrating(true)` 之后加：

```js
refreshBalance();
```

- [ ] **Step 2: 版本与描述**

`package.json`：`"version": "1.1.0"`；description 末尾加 `Shows the DeepSeek account balance beside the pet.`

- [ ] **Step 3: README 功能表加一行**

在状态反应表后加入：

```markdown
### 账户余额

皮卡丘脚下显示当前 DeepSeek 账户的主钱包余额；悬停或点击可查看充值/赠送余额明细。
未登录时点击“去登录”会尝试打开 设置 → 账户；读取失败可点击重试。
```

- [ ] **Step 4: 构建、验证、提交**

```bash
npm run build
npm run verify
git add src/client.template.js client.js package.json README.md
git commit -m "feat: refresh balance on task completion; bump 1.1.0"
```

### Task 5: 安装刷新与手动验证

**Files:** 无源码改动

- [ ] **Step 1: 刷新插件**

`client.js` 内容更新后，DSH Web GUI 刷新页面即可加载新 bundle；若 Plugins 列表元数据需要刷新，用 `plugin_manager` 重新 `remove_bundle` + `install_bundle` 同一路径。

- [ ] **Step 2: 手动验证清单**

- 已登录：标签显示主钱包金额；悬停出现明细（充值/赠送分开）。
- 退出登录：标签变“未登录”；点击“去登录”能打开设置或给出提示。
- 停 host / 断网：标签变 `—` 或旧值降透明；恢复后重试成功。
- 完成一次 Agent 任务：余额在庆祝时刷新一次。
- 60 秒自动刷新；标签/面板 Enter、Space、Escape、失焦。
- 浅色/深色主题；小窗口下明细不溢出。
- 未启用账户：余额 UI 不渲染，皮卡丘与声音正常。

- [ ] **Step 3: 最终验证**

Run: `npm run verify`
Expected: `verify OK: ...`
