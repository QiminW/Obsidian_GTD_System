# 维护资料

普通使用无需执行这里的脚本。工作台和插件已编译并配置好。

## 产品文档与截图

仓库根目录的 README 提供产品介绍，详细安装和操作教程在 `docs/安装与使用.md`。`docs/images/` 中的七张界面截图于 2026-11-02 通过 Obsidian.com 从独立演示库的 1.10.2 版本重新截取，使用工作周报与课程学习两个示例项目。

## GTD 快捷操作

`GTD快捷操作源码/` 内保存当前 1.10.7 的逻辑、Obsidian 接口、日历桥接、日历收缩与展开、撤销历史、键盘控制器、CSS 和检查文件。运行文件在库的 `.obsidian/plugins/gtd-quick-actions/` 中。

如修改源码，安装 Python 后，在当前文件夹执行：

```text
python 构建GTD插件.py
```

脚本将当前源码重新组合到本库的 GTD 插件目录，再在 Obsidian 中重新启用该插件。若要检查逻辑，可在源码文件夹使用 Node.js 执行：

```text
node --test
```

`undo-history.cjs` 保存当前会话最近 30 次写入事务；`undo-history.test.cjs` 检查顺序、并发、冲突及多步补偿，`undo-plugin.test.cjs` 检查真实插件方法的保存边界和快捷键路由。修改笔记的方法应通过 `processGtdChange` 捕获原文，不要用操作之前的异步读取代替实际写入时的快照。改名撤销还需恢复折叠状态及子任务草稿的引用。

`tree-keyboard.cjs` 管理可见行导航和焦点。项目进度通过 `protectProjectView.setUpdate` 接管后续数据同步，按键与输入框事件保留在稳定的节点上；更新缓存节点时必须同步其源任务引用，涉及正在编辑或点击的控件时推迟结构替换。

运行 `python GTD快捷操作源码/界面验证/build.py` 可生成独立 HTML，使用内存中的演示项目验证键盘、局部更新、连续添加、日期面板和缩进。用浏览器打开输出文件即可查看 JSON 结果；该验证不读取个人笔记，也不操作当前 Obsidian 输入框。

`refresh-input.native.js` 和 `refresh-reading-mode.native.js` 是 Obsidian 内的输入与滚动回归脚本。前者检查组合输入、异步读取、连续提交、Esc 和并发高度释放；后者通过真实 Dataview 刷新检查查看模式中的输入、滚动及日历间距。使用专用演示库打开首页的查看模式，退出其他编辑后，通过 Obsidian CLI 的 `eval` 执行脚本。结果保存在 `window.__gtdRefreshInputTest` 和 `window.__realRefreshTest`；每次运行会创建并清理自己的示例项目。

## Tasks Calendar 截止日红底

`calendar-layout.cjs` 在 GTD 页面为日历工具栏加入高度切换按钮，并将日、周、月及逾期卡片的项目名称放入悬浮提示，保留任务 DOM 和输入状态。优先读取卡片上的 `data-gtd-project`，兼容仍在内存中运行的旧卡片所带的源路径。`calendarCompact` 保存显示偏好；卸载时恢复任务提示、移除按钮并断开观察器。

收缩时，日、周和逾期列表通过显示标记保留前 3 项，并添加“更多”入口；月视图继续使用原生裁剪，并为有任务的日期设定最低高度。点击“更多”恢复展开状态，日期入口同时打开对应日视图。卸载时移除显示标记、“更多”按钮和事件监听，不修改任务内容。

`calendar-layout.native.js` 在专用 `Obsidian-GTD-Demo` 演示库运行，验证日／周／月在宽屏、窄屏、密集任务、工具栏重建及插件重新安装后的高度、滚动和偏好保留。通过 Obsidian CLI 的 `eval` 执行；源码在另一个目录时，先将 `window.__gtdCalendarSourceRoot` 设为包含 `维护资料` 的仓库根目录。结果保存在 `window.__gtdCalendarLayoutTest`，临时界面会自动清理。

本包 Tasks Calendar 1.5.4 已完成适配。若重新安装了同版本上游运行文件，可在当前文件夹执行：

```text
python 适配日历.py
```

脚本只为普通卡片和拖动预览卡片增加 GTD 截止日属性与源项目名称属性。项目名称直接取自该任务的源文件，不通过任务名称匹配。它会检查版本、代码位置和重复适配，遇到不匹配的文件时停止。完成后在 Obsidian 中先关闭 GTD 快捷操作，再重新启用 Tasks Calendar 和 GTD 快捷操作。

其他版本需先检查其卡片渲染结构，再调整适配逻辑。上游来源和许可说明在库根目录的 `THIRD-PARTY-NOTICES.md`。

## WebDAV 插件

Remotely Save 仅打包运行文件和许可证，没有 `data.json` 或任何同步账号、服务器及历史数据。启用后由使用者自行配置。
