# 维护资料

普通使用无需执行这里的脚本。工作台和插件已编译并配置好。

## 产品文档与截图

仓库根目录的 README 提供产品介绍，详细安装和操作教程在 `docs/安装与使用.md`。`docs/images/` 中的七张界面截图于 2026-11-02 通过 Obsidian.com 从独立演示库的 1.10.2 版本重新截取，使用工作周报与课程学习两个示例项目。

## GTD 快捷操作

`GTD快捷操作源码/` 内保存当前 1.13.3 的逻辑、Obsidian 接口、日历桥接、日历收缩与展开、撤销历史、键盘控制器、CSS 和检查文件。运行文件在库的 `.obsidian/plugins/gtd-quick-actions/` 中。

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

任务写入及撤销完成后，`publishProjectTaskTree` 直接从实际写入内容生成模型并触发 `gtd-project-tasks-changed`。项目视图立即更新源引用，保存锁在写入结束时解除，不等待后台读取；后续读取仍由渲染序号丢弃过时结果。`task-controls.native.js` 在独立演示库故意暂停显示读取，检查按钮恢复、连续操作、完成限制和撤销。

项目操作失败使用 `showTaskActionError` 的单条临时提醒，约 4 秒后自动关闭；下一次任务写入通过 `clearTaskActionNotice` 立即清除。不要再向任务树追加持久错误行。输入框内用于修正未保存内容的错误仍保留在对应表单中。

父任务行的计数直接读取 `children` 的完成状态；项目整体进度继续使用末级统计。日历桥接在建立完整源引用后通过 `calendarLeafTasks` 排除非末级任务，避免削减索引后破坏安全写回。普通列表、引用和代码块边界遵守源笔记结构；父任务日期与原笔记内容保持不变。`calendar-leaves.test.cjs` 检查筛选与日期继承，`calendar-feedback.test.cjs` 使用本包日历的真实方法片段验证提醒回调及卸载恢复。

运行 `python GTD快捷操作源码/界面验证/build.py` 可生成独立 HTML，使用内存中的演示项目验证键盘、局部更新、连续添加、日期面板和缩进。用浏览器打开输出文件即可查看 JSON 结果；该验证不读取个人笔记，也不操作当前 Obsidian 输入框。

`refresh-input.native.js` 和 `refresh-reading-mode.native.js` 是 Obsidian 内的输入与滚动回归脚本。前者检查组合输入、异步读取、连续提交、Esc 和并发高度释放；后者通过真实 Dataview 刷新检查查看模式中的输入、滚动及日历间距。使用专用演示库打开首页的查看模式，退出其他编辑后，通过 Obsidian CLI 的 `eval` 执行脚本。结果保存在 `window.__gtdRefreshInputTest` 和 `window.__realRefreshTest`；每次运行会创建并清理自己的示例项目。

## Tasks Calendar 截止日红底

`calendar-layout.cjs` 为 GTD 日历提供高度切换和日视图“路径／分组”开关，分别保存为 `calendarCompact` 与 `calendarDayLayout`。当天任务与逾期区在日视图中同步切换；周、月保持紧凑。卡片的完整归属提示读取 `data-gtd-project` 与 `data-gtd-parent-path`；卸载时恢复任务提示、移除按钮并断开观察器。

`calendarTaskContexts` 按准确的源笔记层级生成完整父任务路径与逐级身份，完整索引先验证源引用，再筛选末级任务。`calendar-bridge.cjs` 安装可选 `_gtdRenderDayTasks` 回调，由原生日历 React 按项目、各级父任务构建递归分组，共同上级合并；不同来源的同名分支保持独立。保留原任务渲染和排序处理，不移动 React 管理的卡片 DOM。日期列表与逾期列表使用独立折叠键，各级数量统计当前列表的末级卡片；稳定父任务块 ID 可保留折叠身份。收缩时隐藏所有层级中没有可见卡片的组。`calendar-context.test.cjs`、`calendar-groups.test.cjs` 和 `calendar-parent-layout.native.js` 验证来源、层级合并、布局切换、折叠、勾选、撤销、窄屏及定位。

分组顺序与项目进度共用 `orderProjectPaths` 和 `projectOrder`，未指定的项目按名称 `localeCompare` 补齐，同名项目再按完整路径排序。任务按原始源行号排序，直属任务与子分组交错渲染，已完成卡片保留源位置；每组使用原生 SortableContext。项目顺序事件触发日历局部更新，任务拖动通过源笔记变更同步，卸载时解除事件订阅。

收缩时，日、周和逾期列表通过显示标记保留前 3 项，并添加“更多”入口；月视图继续使用原生裁剪；日、周日期格最低 160px，月日期格最低 112px，空日期和展开、收缩状态均遵守最低高度。点击“更多”恢复展开状态，日期入口同时打开对应日视图。卸载时移除显示标记、“更多”按钮和事件监听，不修改任务内容。

`calendar-layout.native.js` 在专用 `Obsidian-GTD-Demo` 演示库运行，验证日／周／月在宽屏、窄屏、密集任务、工具栏重建及插件重新安装后的高度、滚动和偏好保留。通过 Obsidian CLI 的 `eval` 执行；源码在另一个目录时，先将 `window.__gtdCalendarSourceRoot` 设为包含 `维护资料` 的仓库根目录。结果保存在 `window.__gtdCalendarLayoutTest`，临时界面会自动清理。

本包 Tasks Calendar 1.5.4 已完成适配。若重新安装了同版本上游运行文件，可在当前文件夹执行：

```text
python 适配日历.py
```

脚本为卡片补充截止日、源项目、父级路径及源笔记属性，在普通卡片中加入可定位源任务的路径按钮，为当天与逾期列表加入可选 `_gtdRenderDayTasks` 渲染入口，并保留 `_gtdTaskError` 提醒回调。项目与父级直接取自该任务的源笔记，不通过任务名称匹配。桥接卸载时恢复原回调；GTD 外的日历保留原布局。脚本检查版本、代码位置和重复适配，遇到不匹配的文件时停止。完成后先关闭 GTD 快捷操作，再重新启用 Tasks Calendar 和 GTD 快捷操作。

其他版本需先检查其卡片渲染结构，再调整适配逻辑。上游来源和许可说明在库根目录的 `THIRD-PARTY-NOTICES.md`。

## WebDAV 插件

Remotely Save 仅打包运行文件和许可证，没有 `data.json` 或任何同步账号、服务器及历史数据。启用后由使用者自行配置。

父子规则：`logic.cjs` 在替换父任务完成状态前检查所有后代；取消子任务完成时，按源笔记的真实任务块边界恢复所有已完成的上级并清除完成日期，保留其他分支和日期安排。截止日期与“排”采用逐字段补空白，保留独立设置，新建和移入的子树也继承最近的上级日期。“今”通过 `appendToDescendants` 选项在新增当天安排时，给整个后代任务块追加该天，保留已有日期和完成状态；移出当天不批量删除子任务日程。关联修改在同一次笔记写入中完成，支持整体撤销。`parent-completion.test.cjs`、`parent-dates.test.cjs` 和 `parent-policy.native.js` 覆盖规则、撤销以及演示库实际控件。
