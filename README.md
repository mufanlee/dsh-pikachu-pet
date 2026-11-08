# 皮卡丘桌宠 · DSH 插件

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![assets: fan use only](https://img.shields.io/badge/assets-fan%20use%20only-lightgrey.svg)](NOTICE)

<p align="center">
  <img src="icon.png" width="72" alt="插件图标">
</p>

<p align="center">
  <img src="assets/pose-stand.webp" width="88" alt="站立">
  <img src="assets/pose-run.webp" width="88" alt="奔跑">
  <img src="assets/pose-call.webp" width="88" alt="招呼">
  <img src="assets/pose-laugh.webp" width="88" alt="欢呼">
  <img src="assets/pose-sleep-curl.webp" width="88" alt="睡觉">
</p>

一个给 **DeepSeek Harness（DSH）** 用的桌宠插件：右下角常驻一只皮卡丘，跟随当前会话的 Agent 状态切换动作，任务完成时播放「皮卡皮卡」。

## 它会做什么

| 状态 | 反应 |
| --- | --- |
| 运行中 | 奔跑 / 跳跃，脸颊冒电火花 |
| 等待确认 | 举手跳，头顶「！」 |
| 一轮完成 | 欢呼 + 星光 + 随机叫声 |
| 空闲 90 秒 | 换睡姿趴下，头顶「Zzz」 |

点击皮卡丘会叫一声；悬停右上角可静音；设置 → 通用也有声音开关。8 张姿势、3 段叫声都从候选里随机，避免连续重复。

## 安装

```bash
git clone https://github.com/mufanlee/dsh-pikachu-pet.git
```

在 DSH 会话里让 Agent 把克隆目录作为 bundle 装到当前 profile（`plugin_manager` 的 `install_bundle`），或从 **设置 → Plugins** 添加，然后刷新页面。返回 `application: applied` 即成功。

卸载：**设置 → Plugins** 停用，或调用 `plugin_manager` 的 `remove_bundle`。

## 使用

- 声音开关：**设置 → 通用 → 皮卡丘桌宠 · 声音**，与桌宠喇叭按钮同步；
- 声音偏好存在 `localStorage`，不跨设备同步；
- 浏览器要求先点一下页面才允许出声；
- 需要 **DSH 0.2.1-rc.5**（Web GUI），其他版本未验证。

## 开发

```bash
node src/build-client.cjs   # 重建 client.js
node src/verify-client.cjs  # 校验构建产物与资源
```

或 `npm run build` / `npm run verify`。修改 `src/client.template.js` 或 `assets/` 后必须重新构建；`client.js` 是生成产物，不要手改。

## 结构

```text
dsh-pikachu-pet/
├─ package.json / cordis.patch.yml   # bundle 声明
├─ index.js                          # 宿主侧（空实现）
├─ client.js                         # 构建产物：UI + 内嵌素材
├─ assets/                           # 8 张姿势 + 3 段叫声
├─ src/                              # 源码模板 + 构建/校验脚本
└─ locale/                           # 中英文案
```

## 说明

- 代码采用 [MIT License](LICENSE)；`assets/` 与 `icon.png` 中的皮卡丘图片来自网络上的免费素材，仅供非官方粉丝用途，不在 MIT 范围内，详见 [NOTICE](NOTICE)。
- 仅使用浏览器本地能力（`localStorage` + Web Audio），不联网、无遥测。
