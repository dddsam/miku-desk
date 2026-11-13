---
name: desk-notes
description: 在工作目录中整理任务笔记和执行结果。需要记录计划、待办或工作日志时使用。
---

先使用 skill_read 读取 templates/note.md，再按照用户目标整理笔记。
使用 workspace_list 检查已有文件；已有文件必须先读取，避免无意覆盖。
输出放在工作目录 notes/ 下。文件名包含日期和简短主题。
明确区分已完成、待执行和未验证事项。使用 workspace_write 保存后报告相对路径。
