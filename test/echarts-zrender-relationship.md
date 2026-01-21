# ECharts 与 ZRender 实例关系详解

## 核心结论

**一个 ECharts 实例对应一个 ZRender 实例。**

## 架构关系

```
┌─────────────────────────────────────────┐
│         ECharts 实例 (chart)            │
│  ┌───────────────────────────────────┐  │
│  │    ZRender 实例 (zr)              │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │   Storage (存储所有元素)    │  │  │
│  │  │   - Group (组)              │  │  │
│  │  │   - Rect (矩形)             │  │  │
│  │  │   - Line (线条)             │  │  │
│  │  │   - Text (文本)             │  │  │
│  │  │   - ...                     │  │  │
│  │  └─────────────────────────────┘  │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │   Painter (渲染器)          │  │  │
│  │  │   - Canvas / SVG            │  │  │
│  │  └─────────────────────────────┘  │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │   Handler (事件处理)        │  │  │
│  │  └─────────────────────────────┘  │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │   Animation (动画管理)      │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## 详细说明

### 1. 创建时机

```javascript
// 当你调用 echarts.init() 时
const chart = echarts.init(dom, theme, opts);

// ECharts 内部会创建一个 ZRender 实例
// 源码位置: echarts/src/core/echarts.ts
const zr = this._zr = zrender.init(dom, {
    roughness: opts.roughness,
    renderer: opts.renderer || defaultRenderer,
    devicePixelRatio: opts.devicePixelRatio,
    width: opts.width,
    height: opts.height,
    ssr: opts.ssr,
    useDirtyRect: opts.useDirtyRect,
    useCoarsePointer: opts.useCoarsePointer,
    pointerSize: opts.pointerSize
});
```

### 2. 生命周期

```javascript
// 创建
const chart = echarts.init(dom);  // 同时创建 ZRender 实例

// 使用
chart.setOption(option);          // 通过 ZRender 渲染图形

// 销毁
chart.dispose();                  // 同时销毁 ZRender 实例
```

### 3. 访问 ZRender 实例

```javascript
const chart = echarts.init(dom);
const zr = chart.getZr();  // 获取 ZRender 实例

// ZRender 实例的属性
console.log(zr.id);           // ZRender 实例 ID
console.log(zr.roughness);    // 手绘粗糙度
console.log(zr.filler);       // 填充样式
console.log(zr.storage);      // 元素存储
console.log(zr.painter);      // 渲染器
console.log(zr.handler);      // 事件处理器
console.log(zr.animation);    // 动画管理器
```

### 4. 多图表场景

```javascript
// 场景 1: 同一页面多个图表
const chart1 = echarts.init(dom1);  // ZRender 实例 1
const chart2 = echarts.init(dom2);  // ZRender 实例 2
const chart3 = echarts.init(dom3);  // ZRender 实例 3

// 每个图表都有独立的 ZRender 实例
chart1.getZr() !== chart2.getZr();  // true
chart2.getZr() !== chart3.getZr();  // true
```

```javascript
// 场景 2: 同一个 DOM 重新初始化
const chart1 = echarts.init(dom);
chart1.dispose();  // 销毁 chart1 和它的 ZRender 实例

const chart2 = echarts.init(dom);  // 创建新的 ZRender 实例
// chart1.getZr() !== chart2.getZr()  // true (如果 chart1 没被销毁)
```

### 5. ZRender 实例的职责

一个 ZRender 实例负责：

1. **图形管理**
   - 存储所有图形元素（Group, Rect, Line, Text 等）
   - 管理元素的层级关系（zlevel, z）

2. **渲染**
   - Canvas 渲染
   - SVG 渲染
   - 脏矩形优化

3. **事件处理**
   - 鼠标事件（click, mousemove, mousedown 等）
   - 触摸事件
   - 拖拽事件

4. **动画**
   - 管理所有动画
   - 动画帧调度

5. **性能优化**
   - 增量渲染
   - 脏矩形检测
   - 图层管理

### 6. 元素与 ZRender 的关系

```javascript
// 当元素被添加到图表时
const chart = echarts.init(dom, null, { roughness: 5 });
chart.setOption(option);

// ECharts 会创建各种图形元素并添加到 ZRender
const zr = chart.getZr();
const roots = zr.storage.getRoots();  // 获取所有根元素

// 每个元素都有对 ZRender 实例的引用
roots.forEach(element => {
    console.log(element.__zr === zr);  // true
    console.log(element.roughness);    // 从 ZRender 继承的 roughness
    console.log(element.filler);       // 从 ZRender 继承的 filler
});
```

### 7. 为什么是 1:1 关系？

**设计原因：**

1. **隔离性**：每个图表独立管理自己的图形和状态
2. **性能**：避免不同图表之间的渲染冲突
3. **简单性**：一对一关系更容易理解和维护
4. **灵活性**：每个图表可以有不同的渲染器（Canvas/SVG）和配置

**如果共享 ZRender 会有什么问题？**

```javascript
// 假设多个图表共享一个 ZRender（这是不可能的）
const sharedZr = zrender.init(dom);
const chart1 = new ECharts(sharedZr);  // 假设的 API
const chart2 = new ECharts(sharedZr);  // 假设的 API

// 问题：
// 1. 图形元素会混在一起，难以管理
// 2. 事件处理会冲突
// 3. 动画会互相干扰
// 4. 无法独立销毁某个图表
// 5. 无法为不同图表设置不同的渲染器
```

## 实际应用场景

### 场景 1: 仪表盘（多个图表）

```javascript
// 一个仪表盘页面有 10 个图表
const charts = [];
for (let i = 0; i < 10; i++) {
    const chart = echarts.init(document.getElementById(`chart${i}`));
    charts.push(chart);
    // 每个图表都有自己的 ZRender 实例
}

// 总共有 10 个 ECharts 实例和 10 个 ZRender 实例
```

### 场景 2: 图表切换

```javascript
const dom = document.getElementById('chart');
let currentChart = null;

function showBarChart() {
    if (currentChart) currentChart.dispose();
    currentChart = echarts.init(dom);  // 新的 ZRender 实例
    currentChart.setOption(barOption);
}

function showLineChart() {
    if (currentChart) currentChart.dispose();
    currentChart = echarts.init(dom);  // 新的 ZRender 实例
    currentChart.setOption(lineOption);
}
```

### 场景 3: 手绘风格配置

```javascript
// 不同的图表可以有不同的 roughness 配置
const chart1 = echarts.init(dom1, null, { roughness: 0 });  // 正常风格
const chart2 = echarts.init(dom2, null, { roughness: 3 });  // 轻微手绘
const chart3 = echarts.init(dom3, null, { roughness: 5 });  // 明显手绘

// 每个 ZRender 实例有自己的 roughness 配置
console.log(chart1.getZr().roughness);  // 0
console.log(chart2.getZr().roughness);  // 3
console.log(chart3.getZr().roughness);  // 5
```

## 性能考虑

### 内存占用

```javascript
// 每个 ZRender 实例大约占用：
// - Canvas 元素: ~几 KB
// - 图形元素存储: 取决于图表复杂度
// - 事件监听器: ~几 KB
// - 动画管理器: ~几 KB

// 对于大多数应用，这不是问题
// 但如果页面有几十个图表，需要考虑：
// 1. 按需加载图表
// 2. 虚拟滚动
// 3. 图表复用
```

### 渲染性能

```javascript
// 每个 ZRender 实例独立渲染
// 优点：互不干扰，可以并行
// 缺点：多个图表同时动画可能影响性能

// 优化建议：
// 1. 使用 lazyUpdate
// 2. 减少不必要的动画
// 3. 使用 useDirtyRect 优化
```

## 总结

| 维度 | 说明 |
|------|------|
| **实例关系** | 1 个 ECharts 实例 = 1 个 ZRender 实例 |
| **创建时机** | echarts.init() 时同时创建 |
| **销毁时机** | chart.dispose() 时同时销毁 |
| **独立性** | 每个实例完全独立，互不影响 |
| **访问方式** | chart.getZr() |
| **配置继承** | ZRender 的 roughness/filler 会传递给元素 |

## 相关源码位置

- ECharts 初始化: `echarts/src/core/echarts.ts` (构造函数)
- ZRender 初始化: `zrender/src/zrender.ts` (init 函数)
- 元素添加: `zrender/src/zrender.ts` (add 方法)
- 属性继承: `zrender/src/Element.ts` (addSelfToZr 方法)
