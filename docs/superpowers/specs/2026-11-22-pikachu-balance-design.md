# 皮卡丘桌宠 · 账户余额显示设计

- 日期：2026-11-22
- 状态：已批准（用户确认 UI、刷新、错误态与 watch 混合方案）
- 范围：DSH Web GUI 的 `@local/dsh-pikachu-pet` 插件，仅客户端改动

## 背景与目标

皮卡丘桌宠目前只反映 Agent 会话状态。用户希望在不离开桌面的情况下看到当前 DeepSeek 账户余额。

目标：

1. 常显主钱包余额小标签，悬停/点击可看主钱包与赠送余额明细。
2. 登录态实时（订阅账户 watch 流），金额按时刷新。
3. 未登录、读取失败有明确状态并可引导登录。
4. 不改 host 半，不引入新依赖，不落盘敏感数据。

非目标：

- 不支持其他厂商/API key 余额。
- 不做充值、账单、用量明细。
- 不做多账户切换。

## UX

位置（右下角，皮卡丘不变）：

```
                 ┌──────────────────┐
                 │ 账户余额      ↻  │
                 │ 充值余额    ¥12.34│
                 │ 赠送余额     ¥3.00│
                 │ 更新于 17:03      │
                 └──────────────────┘
                    [¥15.34]   ← 常显小标签（皮卡丘脚下）
                    (皮卡丘 184×184)
```

- 标签：`.pkp-balance`，按钮语义，24px 高；正常 `¥15.34`（主钱包优先 CNY），加载 `¥ ···`，未登录 `未登录`，失败 `—`。
- 明细：点击/悬停/键盘聚焦标签，从标签左侧弹出（`right: calc(100% + 8px)`），不遮皮卡丘；含标题、刷新按钮、充值/赠送分行、更新时间。
- 未登录明细：文案“登录后即可查看余额”，按钮“去登录”尝试 `ctx.layout.selectPanel('settings')`；失败时显示“请打开 设置 → 账户 登录”。
- 失败明细：文案“余额读取失败”，按钮重试；若曾成功过，标签保留旧金额并降低透明度，`title` 提示刷新失败。
- 多钱包：标签取第一个 CNY 钱包，没有则取第一个；明细逐行列出，`CNY→¥`、`USD→$`。
- 无障碍：`aria-expanded` / `aria-controls`，面板 `role="region"`、`aria-live="polite"`；Enter/Space 打开，Escape/失焦关闭；样式只用 `--dsw-alias-*` token。

## 架构

仅改 Client 半（`src/client.template.js` → `client.js`），`index.js` 保持空实现。

```
PetLive (shell.overlay)
  ├─ 皮卡丘 / 气泡 / 静音（现有）
  └─ BalanceChip ── useSyncExternalStore ── createBalanceStore(ctx)
                                              ├─ getBalance()  (金额)
                                              ├─ remote.account.watch (登录态)
                                              └─ 60s interval / 任务完成 / 手动刷新
```

- `package.json` 的 `dsh.client.inject` 保持现有 layout/session；Client 模块工厂 `inject` 增加 `'remote.account'`，`'remoteAccess'` 作为可选依赖读取。
- `createBalanceStore(ctx)` 在 `apply` 中创建，用 `ctx.effect(..., 'pikachu-pet: balance')` 启动与释放；store 暴露 `subscribe`、`getSnapshot`、`refresh`、`dispose`。
- `remote.account` 缺失时 store 标记 `unavailable`，余额 UI 整体不渲染，皮卡丘不受影响。

### 数据契约

```ts
getBalance(meta: {
  version: string;
  locale: string;
  timezoneOffsetSeconds: number;
}): Promise<{ ok: true; value: BalanceSnapshot | null } | { ok: false; error: ... }>

type BalanceSnapshot =
  | { status: 'ready'; value: AccountWallet[]; bonusWallets: AccountWallet[] }
  | { status: 'failed' };

type AccountWallet = { currency: 'CNY' | 'USD'; balance: string };
```

- `version`：`window.__DSH_BOOT__.release.version`，缺失时回退 `'0.2.2-rc.5'`。
- `locale`：`ctx.locale.getSnapshot().active`。
- `timezoneOffsetSeconds`：`-new Date().getTimezoneOffset() * 60`。
- 结果为 `null` → 未登录；`ok:false` 或 `status:'failed'` → 错误；`ready` → 保存。

### 登录态流

```js
ctx.remote.$stream({
  name: 'account',
  open: (signal) => ctx.remote.account.watch(signal),
  ended: () => { /* 标记断开并安排重连 */ },
  carrierFailed: () => { /* 记录，保持轮询 */ },
});
```
- 优先包在 `ctx.remoteAccess.whenAccess('account/watch', ...)` 中；无 `remoteAccess` 直接打开。
- 帧 `{ type: 'snapshot' | 'credentials-changed', state }`：更新登录态；`credentials-changed` 或从未登录变已登录时立即 `refresh()`。
- 断开后 5s 重连，最多 3 次；失败期间仍走 60s 轮询。

## 刷新策略

| 触发 | 行为 |
|---|---|
| 挂载 | 立即拉取，标签显示加载态 |
| 每 60s | 仅 `document.visibilityState === 'visible'` 时拉取 |
| 标签重新可见 | 立即拉取 |
| 任务完成 | 复用现有完成检测（`running:true→false`）后拉取 |
| watch `snapshot` / `credentials-changed` | 更新登录态并按需拉取 |
| 手动 ↻ / 点击失败标签 | 立即拉取 |

## 状态与降级

| 状态 | 标签 | 明细 |
|---|---|---|
| 加载中 | `¥ ···` | 加载提示 |
| 已登录 | `¥15.34` | 充值/赠送分行 + 更新时间 |
| 未登录（null） | `未登录` | 引导登录 |
| 失败且无缓存 | `—` | 失败提示 + 重试 |
| 失败但有缓存 | 旧金额 + 降透明 | 失败提示，保留旧值 |
| remote 不可用 | 不渲染 | 不渲染 |

- 金额变化不改变皮卡丘布局：标签固定高度，皮卡丘尺寸不变。
- 定时器、stream、监听统一在 disposer 清理；面板关闭后不再额外请求。

## 隐私与权限

- 只调用本机 Host 的 `deepseekAccount` 服务，不直连网络，不带 token。
- 余额只存在内存，不写 localStorage、不发遥测。
- 不新增凭据配置；登录由宿主账户设置负责。

## 测试与验证

1. `npm run build`：模板生成 `client.js`。
2. `npm run verify`：继续校验内嵌素材、清单、locale、icon；新增：
   - 生成代码包含 `getBalance`、balance locale 键；
   - stub `ctx.remote.account` / `ctx.remote.$stream` 后 `apply` 不抛错；
   - 纯函数 `formatWallet` / `pickPrimaryWallet` 边界（CNY、USD、非法字符串、空数组）。
3. 手动：
   - 已登录显示金额；退出登录变“未登录”；
   - 停 host/断网后显示 `—` 或旧值降透明；恢复后刷新成功；
   - 任务完成触发一次刷新；60s 自动刷新；
   - 面板 Enter/Space/Escape/失焦；浅色/深色主题；
   - 未启用账户时余额 UI 不存在、桌宠正常。
4. 版本升级：插件 `1.0.0 → 1.1.0`，更新 README 功能表与截图说明。

## 交付

- 改动：`src/client.template.js`、`src/build-client.cjs`（如需 __UI_VERSION__）、`src/verify-client.cjs`、`package.json`（版本/描述）、`README.md`、`locale` 文案、`client.js` 构建产物。
- 安装：本地 bundle 内容更新，刷新页面；必要时 `plugin_manager` 重装以刷新元数据。
- 文档：本文件；实现计划另存 `docs/superpowers/plans/`。
