# 13 Error Handling and Recovery

## 1. 目标与边界

本章解决地球引擎的错误处理与恢复策略问题：

1. 如何设计分层的错误处理机制
2. 如何实现可配置的恢复策略
3. 如何监控和报告错误

本章聚焦错误处理架构，不讨论具体业务逻辑。

---

## 2. 错误分类

### 2.1 按来源分类

**LayerErrorCategory**：
```typescript
export type LayerErrorCategory =
  | "network"   // 网络错误（请求失败、超时）
  | "data"      // 数据错误（解析失败、格式错误）
  | "render"    // 渲染错误（着色器编译、WebGL错误）
  | "unknown";  // 未知错误
```

### 2.2 按严重程度分类

**LayerErrorSeverity**：
```typescript
export type LayerErrorSeverity =
  | "warn"    // 警告：功能降级，但可继续运行
  | "error"   // 错误：功能不可用，但不影响其他功能
  | "fatal";  // 致命：引擎无法继续运行
```

### 2.3 按阶段分类

**常见阶段**：
- `imagery` - 影像加载
- `tile-load` - 瓦片加载
- `tile-parse` - 瓦片解析
- `render` - 渲染
- `interaction` - 交互

---

## 3. 错误负载结构

### 3.1 LayerErrorPayload

```typescript
export interface LayerErrorPayload {
  source: "layer";                    // 错误来源
  layerId: string;                    // 图层ID
  stage: string;                      // 错误阶段
  category: LayerErrorCategory;       // 错误分类
  severity: LayerErrorSeverity;       // 严重程度
  error: unknown;                     // 原始错误对象
  recoverable: boolean;               // 是否可恢复
  tileKey?: string;                   // 相关瓦片Key
  metadata?: Record<string, unknown>; // 额外元数据
}
```

### 3.2 错误报告示例

```typescript
// 网络错误报告
const errorPayload: LayerErrorPayload = {
  source: "layer",
  layerId: "osm-raster",
  stage: "imagery",
  category: "network",
  severity: "warn",
  error: new Error("Failed to fetch tile: timeout"),
  recoverable: true,
  tileKey: "12/2048/1024",
  metadata: {
    url: "https://tile.openstreetmap.org/12/2048/1024.png",
    retryCount: 2
  }
};
```

---

## 4. 恢复策略系统

### 4.1 恢复查询接口

```typescript
export interface LayerRecoveryQuery {
  layerId: string;                    // 图层ID
  stage: string;                      // 错误阶段
  category: LayerErrorCategory;       // 错误分类
  severity: LayerErrorSeverity;       // 严重程度
}
```

### 4.2 恢复覆盖接口

```typescript
export interface LayerRecoveryOverrides {
  // 影像相关
  imageryRetryAttempts?: number;      // 重试次数
  imageryRetryDelayMs?: number;       // 重试延迟
  imageryFallbackColor?: string | null;  // 回退颜色
  
  // 高程相关
  elevationRetryAttempts?: number;
  elevationRetryDelayMs?: number;
  
  // 矢量相关
  vectorParseRetryAttempts?: number;
  vectorParseRetryDelayMs?: number;
  vectorParseFallbackToEmpty?: boolean;  // 是否回退到空数据
}
```

### 4.3 恢复策略配置

```typescript
export interface GlobeEngineRecoveryPolicy {
  defaults?: LayerRecoveryOverrides;      // 默认策略
  rules?: GlobeEngineRecoveryRule[];      // 规则列表
}

export interface GlobeEngineRecoveryRule {
  layerId?: string;                       // 匹配图层ID
  stage?: string;                         // 匹配阶段
  category?: LayerErrorCategory;          // 匹配分类
  severity?: LayerErrorSeverity;          // 匹配严重程度
  overrides: LayerRecoveryOverrides;      // 覆盖配置
}
```

---

## 5. 恢复策略实现

### 5.1 引擎级配置

```typescript
const engine = new GlobeEngine({
  container: document.getElementById("globe")!,
  recoveryPolicy: {
    defaults: {
      imageryRetryAttempts: 3,
      imageryRetryDelayMs: 1000,
      imageryFallbackColor: "#1b2330"
    },
    rules: [
      {
        stage: "imagery",
        category: "network",
        severity: "warn",
        overrides: {
          imageryRetryAttempts: 2,
          imageryRetryDelayMs: 120,
          imageryFallbackColor: "#1b2330"
        }
      },
      {
        stage: "tile-load",
        category: "network",
        severity: "warn",
        overrides: {
          elevationRetryAttempts: 2,
          elevationRetryDelayMs: 80
        }
      }
    ]
  }
});
```

### 5.2 恢复策略解析

```typescript
class RecoveryPolicyManager {
  private defaults: LayerRecoveryOverrides;
  private rules: GlobeEngineRecoveryRule[];
  
  resolveRecovery(query: LayerRecoveryQuery): LayerRecoveryOverrides | undefined {
    // 1. 查找匹配的规则
    for (const rule of this.rules) {
      if (this.matchesRule(rule, query)) {
        return { ...this.defaults, ...rule.overrides };
      }
    }
    
    // 2. 返回默认策略
    return this.defaults;
  }
  
  private matchesRule(rule: GlobeEngineRecoveryRule, query: LayerRecoveryQuery): boolean {
    // 检查各个字段是否匹配
    if (rule.layerId && rule.layerId !== query.layerId) return false;
    if (rule.stage && rule.stage !== query.stage) return false;
    if (rule.category && rule.category !== query.category) return false;
    if (rule.severity && rule.severity !== query.severity) return false;
    
    return true;
  }
}
```

---

## 6. 分层错误处理

### 6.1 错误传播链

```
图层(Layer) -> Surface系统 -> GlobeEngine -> 用户代码
```

### 6.2 图层错误报告

```typescript
abstract class Layer {
  protected context: LayerContext;
  
  protected reportError(payload: Omit<LayerErrorPayload, "source">): void {
    // 调用上下文的错误报告函数
    this.context.reportError?.({
      source: "layer",
      ...payload
    });
  }
  
  protected getRecoveryOptions(
    stage: string,
    category: LayerErrorCategory,
    severity: LayerErrorSeverity
  ): LayerRecoveryOverrides | undefined {
    // 查询恢复策略
    return this.context.resolveRecovery?.({
      layerId: this.id,
      stage,
      category,
      severity
    });
  }
}
```

### 6.3 错误处理示例

```typescript
class RasterLayer extends Layer {
  private async loadTile(tileKey: string): Promise<void> {
    const maxRetries = this.getRecoveryOptions("imagery", "network", "warn")
      ?.imageryRetryAttempts ?? 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const texture = await this.fetchTile(tileKey);
        this.applyTexture(tileKey, texture);
        return;
      } catch (error) {
        // 报告错误
        this.reportError({
          layerId: this.id,
          stage: "imagery",
          category: "network",
          severity: "warn",
          error,
          recoverable: true,
          tileKey,
          metadata: { attempt, maxRetries }
        });
        
        // 等待重试
        const delay = this.getRecoveryOptions("imagery", "network", "warn")
          ?.imageryRetryDelayMs ?? 1000;
        await this.sleep(delay);
      }
    }
    
    // 所有重试失败，使用回退颜色
    this.applyFallbackColor(tileKey);
  }
}
```

---

## 7. 回退机制

### 7.1 颜色回退

```typescript
class RasterLayer extends Layer {
  private applyFallbackColor(tileKey: string): void {
    const fallbackColor = this.getRecoveryOptions("imagery", "network", "warn")
      ?.imageryFallbackColor ?? "#000000";
    
    // 创建纯色纹理
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = fallbackColor;
    ctx.fillRect(0, 0, 256, 256);
    
    // 应用纹理
    const texture = new THREE.CanvasTexture(canvas);
    this.applyTexture(tileKey, texture);
  }
}
```

### 7.2 数据回退

```typescript
class VectorTileLayer extends Layer {
  private async parseTile(tileKey: string, data: ArrayBuffer): Promise<void> {
    try {
      const features = await this.parseVectorData(data);
      this.renderFeatures(tileKey, features);
    } catch (error) {
      // 检查是否允许回退到空数据
      const fallbackToEmpty = this.getRecoveryOptions("tile-parse", "data", "warn")
        ?.vectorParseFallbackToEmpty ?? false;
      
      if (fallbackToEmpty) {
        // 渲染空图层
        this.renderFeatures(tileKey, []);
      } else {
        // 抛出错误
        throw error;
      }
    }
  }
}
```

---

## 8. 错误监控

### 8.1 错误统计

```typescript
class ErrorMonitor {
  private errors: Map<string, ErrorStats> = new Map();
  
  recordError(payload: LayerErrorPayload): void {
    const key = `${payload.layerId}:${payload.stage}:${payload.category}`;
    
    if (!this.errors.has(key)) {
      this.errors.set(key, {
        count: 0,
        lastError: null,
        firstOccurred: Date.now()
      });
    }
    
    const stats = this.errors.get(key)!;
    stats.count++;
    stats.lastError = payload;
    stats.lastOccurred = Date.now();
  }
  
  getStats(): Map<string, ErrorStats> {
    return this.errors;
  }
}
```

### 8.2 错误事件

```typescript
// 监听错误事件
engine.on("error", (payload: LayerErrorPayload) => {
  console.error("Layer error:", {
    layerId: payload.layerId,
    stage: payload.stage,
    category: payload.category,
    severity: payload.severity,
    error: payload.error
  });
  
  // 可以发送到监控系统
  if (payload.severity === "fatal") {
    reportToMonitoringSystem(payload);
  }
});
```

---

## 9. 常见错误场景

### 9.1 网络错误

**场景**：瓦片加载失败

**处理策略**：
1. 重试（可配置次数和延迟）
2. 使用缓存的旧数据
3. 显示回退颜色

### 9.2 数据错误

**场景**：瓦片解析失败

**处理策略**：
1. 记录错误日志
2. 尝试使用默认数据
3. 显示空图层

### 9.3 渲染错误

**场景**：着色器编译失败

**处理策略**：
1. 使用备用着色器
2. 降级到简单材质
3. 报告致命错误

---

## 10. 最佳实践

### 10.1 错误处理原则

1. **优雅降级**：错误不应导致整个引擎崩溃
2. **用户友好**：提供清晰的错误信息
3. **可恢复性**：尽可能从错误中恢复
4. **可观测性**：记录足够的错误信息用于调试

### 10.2 恢复策略设计

1. **分层配置**：支持全局默认和特定规则
2. **动态调整**：支持运行时修改恢复策略
3. **统计监控**：记录恢复策略的命中率

---

## 11. 验收清单

满足以下项可认为错误处理达标：

1. [ ] 错误分类清晰（category/severity）
2. [ ] 恢复策略可配置
3. [ ] 错误事件正确传播
4. [ ] 回退机制有效
5. [ ] 错误监控完整

---

## 12. 参考源码

- `src/layers/Layer.ts` - 错误接口定义
- `src/engine/EngineOptions.ts` - 恢复策略配置
- `src/engine/GlobeEngine.ts` - 错误事件处理
- `src/layers/RasterLayer.ts` - 错误处理示例

---

## 13. 下一步行动

1. 实现更细粒度的恢复策略
2. 添加错误统计和监控
3. 优化错误恢复性能
4. 完善错误文档和示例