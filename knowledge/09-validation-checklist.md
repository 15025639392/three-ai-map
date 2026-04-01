# 09 Validation Checklist

## 1. 功能正确性

1. 无 terrain 时影像可稳定显示（ellipsoid host 生效）
2. terrain 开启后按编码正确隆起（如 terrarium）
3. 影像可请求到 provider `maxZoom`（不被 terrain maxZoom 误钳）
4. 极区、反经线、视野边缘无系统性漏瓦片

## 2. 稳定性

1. 不出现 `globeMesh/imagery/terrain` 交替闪烁
2. 父级保留 + 子级就绪后原子替换生效
3. 无黑块/灰块占位穿刺
4. 缩放/平移高频操作下无持续抖动和方向反转

## 3. 性能

1. 合成路径为单 pass 或可控 pass
2. 请求队列无风暴（并发受控）
3. 缓存回收无“抖动式装卸”
4. 显存与 CPU 内存增长可预测并受阈值限制

## 4. 诊断能力

1. 可查看 queued/downloading/parsing/loaded/failed
2. 可查看 active/visible/used tile 计数
3. 可追踪单 tile 生命周期与替换路径
4. 可一键打开 debug overlay（边界、level、error）

## 5. 必备回归场景

1. 全球低空横移（跨经线）
2. 极区缩放和旋转
3. 高频 zoom in/out 循环
4. 只开影像、只开地形、影像+地形、叠加 3DTiles 四组组合

