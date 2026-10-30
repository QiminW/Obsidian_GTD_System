# 维护资料

普通使用无需执行这里的脚本。工作台和插件已编译并配置好。

## GTD 快捷操作

`GTD快捷操作源码/` 内保存当前 1.9.7 的逻辑、Obsidian 接口、日历桥接、CSS 和检查文件。运行文件在库的 `.obsidian/plugins/gtd-quick-actions/` 中。

如修改源码，安装 Python 后，在当前文件夹执行：

```text
python 构建GTD插件.py
```

脚本将当前源码重新组合到本库的 GTD 插件目录，再在 Obsidian 中重新启用该插件。若要检查逻辑，可在源码文件夹使用 Node.js 执行：

```text
node --test logic.test.cjs inbox-move.test.cjs inline-edit.test.cjs name-edit-state.test.cjs inline-entry-state.test.cjs completed-display.test.cjs
```

## Tasks Calendar 截止日红底

本包 Tasks Calendar 1.5.4 已完成适配。若重新安装了同版本上游运行文件，可在当前文件夹执行：

```text
python 适配日历.py
```

脚本只为两个原生卡片增加 GTD 截止日属性。它会检查版本、代码位置和重复适配，遇到不匹配的文件时停止。完成后在 Obsidian 中先关闭 GTD 快捷操作，再重新启用 Tasks Calendar 和 GTD 快捷操作。

其他版本需先检查其卡片渲染结构，再调整适配逻辑。上游来源和许可说明在库根目录的 `THIRD-PARTY-NOTICES.md`。

## WebDAV 插件

Remotely Save 仅打包运行文件和许可证，没有 `data.json` 或任何同步账号、服务器及历史数据。启用后由使用者自行配置。
