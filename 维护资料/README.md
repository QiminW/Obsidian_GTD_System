# 维护资料

普通使用无需执行这里的脚本。工作台和插件已编译并配置好。

## GTD 快捷操作

`GTD快捷操作源码/` 内保存当前 1.9.9 的逻辑、Obsidian 接口、日历桥接、撤销历史、CSS 和检查文件。运行文件在库的 `.obsidian/plugins/gtd-quick-actions/` 中。

如修改源码，安装 Python 后，在当前文件夹执行：

```text
python 构建GTD插件.py
```

脚本将当前源码重新组合到本库的 GTD 插件目录，再在 Obsidian 中重新启用该插件。若要检查逻辑，可在源码文件夹使用 Node.js 执行：

```text
node --test
```

`undo-history.cjs` 保存当前会话最近 30 次写入事务；`undo-history.test.cjs` 检查顺序、并发、冲突及多步补偿，`undo-plugin.test.cjs` 检查真实插件方法的保存边界和快捷键路由。修改笔记的方法应通过 `processGtdChange` 捕获原文，不要用操作之前的异步读取代替实际写入时的快照。改名撤销还需恢复折叠状态及子任务草稿的引用。

`refresh-input.native.js` 和 `refresh-reading-mode.native.js` 是 Obsidian 内的输入与滚动回归脚本。前者检查组合输入、异步读取、连续提交、Esc 和并发高度释放；后者通过真实 Dataview 刷新检查查看模式中的输入、滚动及日历间距。使用专用演示库打开首页的查看模式，退出其他编辑后，通过 Obsidian CLI 的 `eval` 执行脚本。结果保存在 `window.__gtdRefreshInputTest` 和 `window.__realRefreshTest`；每次运行会创建并清理自己的示例项目。

## Tasks Calendar 截止日红底

本包 Tasks Calendar 1.5.4 已完成适配。若重新安装了同版本上游运行文件，可在当前文件夹执行：

```text
python 适配日历.py
```

脚本只为两个原生卡片增加 GTD 截止日属性。它会检查版本、代码位置和重复适配，遇到不匹配的文件时停止。完成后在 Obsidian 中先关闭 GTD 快捷操作，再重新启用 Tasks Calendar 和 GTD 快捷操作。

其他版本需先检查其卡片渲染结构，再调整适配逻辑。上游来源和许可说明在库根目录的 `THIRD-PARTY-NOTICES.md`。

## WebDAV 插件

Remotely Save 仅打包运行文件和许可证，没有 `data.json` 或任何同步账号、服务器及历史数据。启用后由使用者自行配置。
