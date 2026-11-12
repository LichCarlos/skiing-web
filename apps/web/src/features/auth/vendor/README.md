# React Bits Waves 来源

`waves.tsx` 来自用户指定的 [React Bits Waves Studio](https://www.reactbits.dev/tools/background-studio?bg=waves)，不是用CSS曲线冒充原效果。

- [上游源码](https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/Backgrounds/Waves/Waves.tsx)，2026-11-06 获取；WebGL2，无新增npm依赖。
- 许可为 **MIT + Commons Clause**，不是无条件MIT。保留完整[许可](LICENSE.react-bits.md)；允许嵌入本站，不得将组件/背景本身作为模板包或工具转售/再分发。
- 本地适配：CSS Modules及@/路径、严格索引空值处理；卸载释放GPU资源但不调用loseContext，避免StrictMode同一canvas重放effect失败。
- AuthBackground配置蓝色#2455F5、红色#FF3B4D，关闭点击波纹，降低速度/DPR；提供暂停和系统减少动画适配。无WebGL2保留蓝底，不影响表单。
- 监听/RAF/ResizeObserver/IntersectionObserver/GPU资源清理保留，仅登录页加载。
