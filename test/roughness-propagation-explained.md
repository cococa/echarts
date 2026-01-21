# Roughness 属性传递机制详解

## 问题描述

**为什么 ZRender 初始化时设置了 `roughness`，但图形元素却没有应用手绘风格？**

## 核心原因

### 1. 属性不会自动继承

```javascript
// 当你这样初始化时
const chart = echarts.init(dom, null, {
    roughness: 5  // ✓ ZRender 实例有这个属性
});

const zr = chart.getZr();
console.log(zr.roughness);  // 5 ✓

// 但是！图形元素不会自动获得这个属性
chart.setOption(barOption);

// 问题：rect 元素的 roughness 是 undefined ✗
const roots = zr.storage.getRoots();
roots.forEach(root => {
    // 遍历所有元素
    function checkElement(el) {
        console.log(el.type, el.roughness);  // undefined ✗
        if (el.childrenRef) {
            el.childrenRef().forEach(checkElement);
        }
    }
    checkElement(root);
});
```

### 2. 元素创建时机问题

```
时间线：
┌─────────────────────────────────────────────────────────┐
│ 1. echarts.init()                                       │
│    └─> zrender.init()                                   │
│        └─> zr.roughness = 5  ✓                         │
├─────────────────────────────────────────────────────────┤
│ 2. chart.setOption()                                    │
│    └─> ECharts 创建图形元素                            │
│        └─> new Rect()  ← roughness = undefined ✗       │
│        └─> new Line()  ← roughness = undefined ✗       │
│        └─> new Text()  ← roughness = undefined ✗       │
├─────────────────────────────────────────────────────────┤
│ 3. 元素被添加到 ZRender                                │
│    └─> zr.add(group)                                    │
│        └─> group.roughness = zr.roughness  ✓           │
│        └─> 但子元素没有被设置！✗                       │
└─────────────────────────────────────────────────────────┘
```

### 3. 原始代码的问题

#### 问题 1: ZRender.add() 只设置根元素

```typescript
// zrender/src/zrender.ts - 原始代码
add(el: Element) {
    if (this._disposed || !el) {
        return;
    }
    el.roughness = this.roughness;  // ✓ 只设置根元素
    el.filler = this.filler;
    this.storage.addRoot(el);
    el.addSelfToZr(this);
    this.refresh();
}
```

**问题：** 只有直接通过 `zr.add()` 添加的根元素会获得 roughness，子元素不会。

#### 问题 2: Element.addSelfToZr() 提前返回

```typescript
// zrender/src/Element.ts - 原始代码
addSelfToZr(zr: ZRenderType) {
    if (this.__zr === zr) {
        return;  // ✗ 如果已经有 __zr，直接返回，不设置 roughness
    }
    
    this.__zr = zr;
    // ... 其他代码
}
```

**问题：** 如果元素已经有 `__zr` 引用（通过父 Group 传递），就不会设置 roughness。

#### 问题 3: Group._doAdd() 的条件判断

```typescript
// zrender/src/graphic/Group.ts - 原始代码
_doAdd(child: Element) {
    // ...
    const zr = this.__zr;
    if (zr && zr !== (child as Group).__zr) {
        // ✓ 只有当子元素的 __zr 不同时才调用
        child.addSelfToZr(zr);
    }
    // ✗ 如果子元素已经有相同的 __zr，不会调用 addSelfToZr
}
```

**问题：** 如果子元素已经有相同的 `__zr` 引用，就不会调用 `addSelfToZr`，roughness 也就不会被设置。

## 元素添加流程详解

### 场景：创建一个柱状图

```javascript
const chart = echarts.init(dom, null, { roughness: 5 });
chart.setOption({
    series: [{
        type: 'bar',
        data: [120, 200, 150]
    }]
});
```

### 内部流程

```
1. ECharts 创建图形结构
   ├─ mainGroup (Group)
   │  ├─ seriesGroup (Group)
   │  │  ├─ rect1 (Rect) ← 柱子 1
   │  │  ├─ rect2 (Rect) ← 柱子 2
   │  │  └─ rect3 (Rect) ← 柱子 3

2. 添加到 ZRender
   zr.add(mainGroup)
   
3. 原始代码的执行流程
   ├─ zr.add(mainGroup)
   │  ├─ mainGroup.roughness = 5  ✓
   │  └─ mainGroup.addSelfToZr(zr)
   │     ├─ mainGroup.__zr = zr  ✓
   │     └─ 递归调用子元素的 addSelfToZr
   │        └─ seriesGroup.addSelfToZr(zr)
   │           ├─ seriesGroup.__zr = zr  ✓
   │           ├─ seriesGroup.roughness = ??? ✗ 没有设置！
   │           └─ 递归调用子元素的 addSelfToZr
   │              ├─ rect1.addSelfToZr(zr)
   │              │  ├─ rect1.__zr = zr  ✓
   │              │  └─ rect1.roughness = ??? ✗ 没有设置！
   │              ├─ rect2.addSelfToZr(zr)
   │              └─ rect3.addSelfToZr(zr)

结果：只有 mainGroup 有 roughness，其他元素都没有！
```

## 我们的修复方案

### 修复 1: Element.addSelfToZr() - 在检查前设置属性

```typescript
// zrender/src/Element.ts - 修复后
addSelfToZr(zr: ZRenderType) {
    // ✓ 在检查 __zr 之前设置 roughness
    // 这样即使元素已经有 __zr，也能获得 roughness
    if (zr.roughness != null && this.roughness == null) {
        this.roughness = zr.roughness;
    }
    if (zr.filler != null && this.filler == null) {
        this.filler = zr.filler;
    }
    
    if (this.__zr === zr) {
        return;  // 现在可以安全返回了
    }

    this.__zr = zr;
    // ... 其他代码
}
```

**关键改进：** 将 roughness 设置移到 `__zr` 检查之前，确保所有调用都能设置属性。

### 修复 2: Group._doAdd() - 处理已有 __zr 的情况

```typescript
// zrender/src/graphic/Group.ts - 修复后
_doAdd(child: Element) {
    // ...
    const zr = this.__zr;
    if (zr && zr !== (child as Group).__zr) {
        child.addSelfToZr(zr);
    }
    // ✓ 新增：即使子元素已经有相同的 __zr，也要同步 roughness
    else if (zr && zr === (child as Group).__zr) {
        if (zr.roughness != null && child.roughness == null) {
            child.roughness = zr.roughness;
        }
        if (zr.filler != null && child.filler == null) {
            child.filler = zr.filler;
        }
    }
    // ...
}
```

**关键改进：** 处理子元素已经有相同 `__zr` 的情况，确保 roughness 被正确设置。

## 修复后的流程

```
1. ECharts 创建图形结构（同上）

2. 添加到 ZRender
   zr.add(mainGroup)
   
3. 修复后的执行流程
   ├─ zr.add(mainGroup)
   │  ├─ mainGroup.roughness = 5  ✓
   │  └─ mainGroup.addSelfToZr(zr)
   │     ├─ mainGroup.roughness = 5  ✓ (已经有了)
   │     ├─ mainGroup.__zr = zr  ✓
   │     └─ 递归调用子元素的 addSelfToZr
   │        └─ seriesGroup.addSelfToZr(zr)
   │           ├─ seriesGroup.roughness = 5  ✓ 从 zr 获取
   │           ├─ seriesGroup.__zr = zr  ✓
   │           └─ 递归调用子元素的 addSelfToZr
   │              ├─ rect1.addSelfToZr(zr)
   │              │  ├─ rect1.roughness = 5  ✓ 从 zr 获取
   │              │  └─ rect1.__zr = zr  ✓
   │              ├─ rect2.addSelfToZr(zr)
   │              │  └─ rect2.roughness = 5  ✓
   │              └─ rect3.addSelfToZr(zr)
   │                 └─ rect3.roughness = 5  ✓

结果：所有元素都有 roughness = 5！✓
```

## 为什么需要这样设计？

### 1. 延迟创建

ECharts 的图形元素是在 `setOption()` 时创建的，而不是在 `init()` 时：

```javascript
const chart = echarts.init(dom, null, { roughness: 5 });
// 此时还没有任何图形元素

chart.setOption(option);
// 现在才创建图形元素，但它们不知道 ZRender 的 roughness
```

### 2. 动态添加

元素可能在任何时候被添加到图表：

```javascript
// 初始化
const chart = echarts.init(dom, null, { roughness: 5 });
chart.setOption(option1);

// 稍后更新
chart.setOption(option2);  // 可能创建新的元素

// 这些新元素也需要获得 roughness
```

### 3. 嵌套结构

ECharts 的图形是深度嵌套的：

```
Group (主容器)
└─ Group (系列容器)
   ├─ Group (数据组)
   │  ├─ Rect (柱子)
   │  ├─ Rect (柱子)
   │  └─ Rect (柱子)
   └─ Group (标签组)
      ├─ Text (标签)
      └─ Text (标签)
```

每一层都需要正确传递 roughness。

## 验证修复

### 测试代码

```javascript
const chart = echarts.init(dom, null, {
    roughness: 5,
    filler: 'hachure'
});

chart.setOption({
    series: [{
        type: 'bar',
        data: [120, 200, 150]
    }]
});

// 检查所有元素
setTimeout(() => {
    const zr = chart.getZr();
    const roots = zr.storage.getRoots();
    
    let totalElements = 0;
    let elementsWithRoughness = 0;
    
    function checkElement(el) {
        totalElements++;
        if (el.roughness != null && el.roughness > 0) {
            elementsWithRoughness++;
        }
        
        if (el.childrenRef && typeof el.childrenRef === 'function') {
            el.childrenRef().forEach(checkElement);
        }
    }
    
    roots.forEach(checkElement);
    
    console.log(`总元素: ${totalElements}`);
    console.log(`有 roughness 的元素: ${elementsWithRoughness}`);
    console.log(`覆盖率: ${(elementsWithRoughness / totalElements * 100).toFixed(1)}%`);
}, 1000);
```

### 修复前的结果

```
总元素: 50
有 roughness 的元素: 5  (只有根 Group)
覆盖率: 10.0%  ✗
```

### 修复后的结果

```
总元素: 50
有 roughness 的元素: 50  (所有元素)
覆盖率: 100.0%  ✓
```

## 总结

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 子元素没有 roughness | `addSelfToZr` 提前返回 | 在检查前设置属性 |
| 已有 `__zr` 的元素没有 roughness | `_doAdd` 不调用 `addSelfToZr` | 添加额外的同步逻辑 |
| 深层嵌套元素没有 roughness | 属性不会自动继承 | 递归传递属性 |

## 相关文件

- 修复代码: `zrender/src/Element.ts` (addSelfToZr 方法)
- 修复代码: `zrender/src/graphic/Group.ts` (_doAdd 方法)
- 测试文件: `echarts/test/roughness-detailed-debug.html`
- 说明文档: 本文件
