# 第三方插件来源与本地改动

本包包含以下第三方插件的已编译运行文件。各插件目录中的许可证文件保留上游原文。

| 插件 | 版本 | 上游 | 许可证原文 |
| --- | --- | --- | --- |
| Dataview | 0.5.68 | [blacksmithgu/obsidian-dataview](https://github.com/blacksmithgu/obsidian-dataview) | [上游 LICENSE.txt](https://raw.githubusercontent.com/blacksmithgu/obsidian-dataview/0.5.68/LICENSE.txt) |
| Tasks | 8.6.0 | [obsidian-tasks-group/obsidian-tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) | [上游 LICENSE](https://raw.githubusercontent.com/obsidian-tasks-group/obsidian-tasks/8.6.0/LICENSE) |
| Tasks Calendar | 1.5.4 | [eero-lehtinen/obsidian-tasks-calendar](https://github.com/eero-lehtinen/obsidian-tasks-calendar) | [上游 LICENSE](https://raw.githubusercontent.com/eero-lehtinen/obsidian-tasks-calendar/1.5.4/LICENSE) |
| Remotely Save（可选） | 0.3.25 | [remotely-save/remotely-save](https://github.com/remotely-save/remotely-save) | [0.3.25 上游 LICENSE](https://raw.githubusercontent.com/remotely-save/remotely-save/0.3.25/LICENSE) |

Dataview、Tasks、Tasks Calendar 按其上游 MIT 许可证保留版权和许可声明。Remotely Save 0.3.25 按该版本的 Apache License 2.0 保留许可证，运行文件未经修改，未包含用户数据。各自原有编译文件中的依赖许可注释也保持原样。

## Tasks Calendar 的本地适配

基于上游 1.5.4 运行文件，在普通任务卡片和拖动预览卡片各加入一个 `data-gtd-deadline` 属性。该属性仅在配套 GTD 桥接将实例标记为真实截止日时输出，用于 CSS 红底显示。

其余原版代码保持不变。多日安排、源任务同步和安全写回逻辑由本包的 GTD 快捷操作插件提供。目录名和插件版本保留上游值，README 中明确标注为工作台适配版。

适配可通过 `维护资料/适配日历.py` 对同版本的上游运行文件重新应用。该脚本会检查版本和代码位置，遇到不同结构时停止。

## 本地配套内容

GTD 快捷操作、项目进度脚本、导航、模板、CSS、示例内容和使用说明是本工作台的本地配套内容，不代表第三方作者对工作台本地功能的维护或认可。源码保存在 `维护资料/GTD快捷操作源码/`。

## 任务底色来源

八级任务底色采用 [Radix Colors 官方色板](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)的第 4 阶，原始色值来自 [light.ts](https://raw.githubusercontent.com/radix-ui/colors/main/src/light.ts)。底色按 32% 原色与 68% 米白混合。仅采用色值，未引入组件运行文件；对应关系见 `维护资料/底色来源.md`。
