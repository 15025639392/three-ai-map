# 25 Advanced Features

## 1. 目标与边界

本章补充高级功能：

1. GPU 拾取系统
2. 手势处理系统
3. 后处理效果
4. 日夜交替系统
5. 云层渲染

---

## 2. GPU 拾取系统

### 2.1 原理

使用颜色编码将对象 ID 写入单独的帧缓冲，读取鼠标位置的颜色即可得到对象 ID。

### 2.2 实现

```typescript
class GPUPicker {
  private renderer: WebGLRenderer;
  private pickingTarget: WebGLRenderTarget;
  private pickingScene: Scene;
  private pickingCamera: Camera;
  private idMap: Map<number, Object3D> = new Map();
  private nextId: number = 1;
  
  constructor(renderer: WebGLRenderer) {
    this.renderer = renderer;
    
    // 创建拾取渲染目标（低分辨率即可）
    this.pickingTarget = new WebGLRenderTarget(1, 1, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      format: RGBAFormat
    });
    
    this.pickingScene = new Scene();
    this.pickingCamera = new PerspectiveCamera();
  }
  
  // 注册可拾取对象
  register(object: Object3D): number {
    const id = this.nextId++;
    this.idMap.set(id, object);
    
    // 创建拾取材质（颜色编码 ID）
    const pickingMaterial = new ShaderMaterial({
      uniforms: {
        pickColor: { value: this.idToColor(id) }
      },
      vertexShader: `
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 pickColor;
        void main() {
          gl_FragColor = vec4(pickColor, 1.0);
        }
      `
    });
    
    // 创建拾取网格
    const pickingMesh = new Mesh(object.geometry, pickingMaterial);
    pickingMesh.position.copy(object.position);
    pickingMesh.rotation.copy(object.rotation);
    pickingMesh.scale.copy(object.scale);
    pickingMesh.userData.pickId = id;
    
    this.pickingScene.add(pickingMesh);
    
    return id;
  }
  
  // 拾取
  pick(x: number, y: number, camera: Camera): Object3D | null {
    // 1. 渲染拾取场景
    this.renderer.setRenderTarget(this.pickingTarget);
    this.renderer.render(this.pickingScene, camera);
    
    // 2. 读取像素
    const pixel = new Uint8Array(4);
    this.renderer.readRenderTargetPixels(
      this.pickingTarget,
      x,
      this.pickingTarget.height - y,
      1,
      1,
      pixel
    );
    
    this.renderer.setRenderTarget(null);
    
    // 3. 解码 ID
    const id = this.colorToId(pixel[0], pixel[1], pixel[2]);
    
    return this.idMap.get(id) ?? null;
  }
  
  // ID 转颜色
  private idToColor(id: number): Vector3 {
    return new Vector3(
      (id & 0xFF) / 255,
      ((id >> 8) & 0xFF) / 255,
      ((id >> 16) & 0xFF) / 255
    );
  }
  
  // 颜色转 ID
  private colorToId(r: number, g: number, b: number): number {
    return r + (g << 8) + (b << 16);
  }
}
```

### 2.3 使用示例

```typescript
const picker = new GPUPicker(engine.renderer);

// 注册可拾取对象
const markerId = picker.register(markerMesh);
const buildingId = picker.register(buildingMesh);

// 拾取
engine.on('click', (event) => {
  const picked = picker.pick(event.clientX, event.clientY, engine.camera);
  
  if (picked) {
    console.log('拾取到:', picked.userData.pickId);
  }
});
```

---

## 3. 手势处理系统

### 3.1 手势类型

```typescript
enum GestureType {
  PAN,        // 平移
  ROTATE,     // 旋转
  ZOOM,       // 缩放
  TILT,       // 倾斜
  CLICK,      // 点击
  LONG_PRESS  // 长按
}
```

### 3.2 手势控制器

```typescript
class GestureController {
  private element: HTMLElement;
  private handlers: Map<GestureType, GestureHandler> = new Map();
  
  // 状态
  private isPanning = false;
  private isRotating = false;
  private isZooming = false;
  private lastPosition = { x: 0, y: 0 };
  private lastDistance = 0;
  
  constructor(element: HTMLElement) {
    this.element = element;
    this.bindEvents();
  }
  
  private bindEvents(): void {
    // 鼠标事件
    this.element.addEventListener('mousedown', this.onMouseDown.bind(this));
    this.element.addEventListener('mousemove', this.onMouseMove.bind(this));
    this.element.addEventListener('mouseup', this.onMouseUp.bind(this));
    this.element.addEventListener('wheel', this.onWheel.bind(this));
    
    // 触摸事件
    this.element.addEventListener('touchstart', this.onTouchStart.bind(this));
    this.element.addEventListener('touchmove', this.onTouchMove.bind(this));
    this.element.addEventListener('touchend', this.onTouchEnd.bind(this));
  }
  
  // 鼠标按下
  private onMouseDown(event: MouseEvent): void {
    this.isPanning = true;
    this.lastPosition = { x: event.clientX, y: event.clientY };
    
    // 检测右键旋转
    if (event.button === 2) {
      this.isRotating = true;
    }
  }
  
  // 鼠标移动
  private onMouseMove(event: MouseEvent): void {
    if (!this.isPanning) return;
    
    const deltaX = event.clientX - this.lastPosition.x;
    const deltaY = event.clientY - this.lastPosition.y;
    
    if (this.isRotating) {
      this.emit(GestureType.ROTATE, { deltaX, deltaY });
    } else {
      this.emit(GestureType.PAN, { deltaX, deltaY });
    }
    
    this.lastPosition = { x: event.clientX, y: event.clientY };
  }
  
  // 鼠标释放
  private onMouseUp(event: MouseEvent): void {
    this.isPanning = false;
    this.isRotating = false;
  }
  
  // 滚轮缩放
  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.emit(GestureType.ZOOM, { delta: -event.deltaY });
  }
  
  // 触摸开始
  private onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      // 单指平移
      this.isPanning = true;
      this.lastPosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      };
    } else if (event.touches.length === 2) {
      // 双指缩放
      this.isZooming = true;
      this.lastDistance = this.getTouchDistance(event.touches);
    }
  }
  
  // 触摸移动
  private onTouchMove(event: TouchEvent): void {
    event.preventDefault();
    
    if (event.touches.length === 1 && this.isPanning) {
      // 单指平移
      const deltaX = event.touches[0].clientX - this.lastPosition.x;
      const deltaY = event.touches[0].clientY - this.lastPosition.y;
      
      this.emit(GestureType.PAN, { deltaX, deltaY });
      
      this.lastPosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      };
    } else if (event.touches.length === 2 && this.isZooming) {
      // 双指缩放
      const distance = this.getTouchDistance(event.touches);
      const scale = distance / this.lastDistance;
      
      this.emit(GestureType.ZOOM, { scale });
      
      this.lastDistance = distance;
    }
  }
  
  // 触摸结束
  private onTouchEnd(event: TouchEvent): void {
    this.isPanning = false;
    this.isZooming = false;
  }
  
  // 获取双指距离
  private getTouchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  // 触发手势
  private emit(type: GestureType, data: any): void {
    const handler = this.handlers.get(type);
    if (handler) {
      handler(data);
    }
  }
  
  // 注册处理器
  on(type: GestureType, handler: GestureHandler): void {
    this.handlers.set(type, handler);
  }
}
```

### 3.3 使用示例

```typescript
const gestures = new GestureController(engine.container);

// 平移
gestures.on(GestureType.PAN, ({ deltaX, deltaY }) => {
  engine.pan(deltaX, deltaY);
});

// 缩放
gestures.on(GestureType.ZOOM, ({ delta, scale }) => {
  if (delta !== undefined) {
    engine.zoom(delta * 0.001);
  } else if (scale !== undefined) {
    engine.zoom(Math.log2(scale));
  }
});

// 旋转
gestures.on(GestureType.ROTATE, ({ deltaX, deltaY }) => {
  engine.rotate(deltaX * 0.01, deltaY * 0.01);
});
```

---

## 4. 后处理效果

### 4.1 后处理管线

```typescript
class PostProcessingPipeline {
  private renderer: WebGLRenderer;
  private passes: PostProcessingPass[] = [];
  private inputTarget: WebGLRenderTarget;
  private outputTarget: WebGLRenderTarget;
  
  constructor(renderer: WebGLRenderer, width: number, height: number) {
    this.renderer = renderer;
    
    this.inputTarget = new WebGLRenderTarget(width, height);
    this.outputTarget = new WebGLRenderTarget(width, height);
  }
  
  addPass(pass: PostProcessingPass): void {
    this.passes.push(pass);
  }
  
  render(scene: Scene, camera: Camera): void {
    // 1. 渲染场景到输入目标
    this.renderer.setRenderTarget(this.inputTarget);
    this.renderer.render(scene, camera);
    
    // 2. 应用后处理
    let currentInput = this.inputTarget;
    
    for (const pass of this.passes) {
      pass.render(currentInput, this.outputTarget, this.renderer);
      
      // 交换输入输出
      [currentInput, this.outputTarget] = [this.outputTarget, currentInput];
    }
    
    // 3. 渲染到屏幕
    this.renderer.setRenderTarget(null);
    this.renderer.render(currentInput.texture);
  }
  
  resize(width: number, height: number): void {
    this.inputTarget.setSize(width, height);
    this.outputTarget.setSize(width, height);
    
    for (const pass of this.passes) {
      pass.resize(width, height);
    }
  }
}
```

### 4.2 Bloom 效果

```typescript
class BloomPass implements PostProcessingPass {
  private material: ShaderMaterial;
  private strength: number;
  private radius: number;
  
  constructor(strength: number = 0.5, radius: number = 0.4) {
    this.strength = strength;
    this.radius = radius;
    
    this.material = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        strength: { value: strength },
        radius: { value: radius }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float strength;
        uniform float radius;
        varying vec2 vUv;
        
        void main() {
          vec4 color = texture2D(tDiffuse, vUv);
          
          // 提取高亮区域
          float brightness = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
          if (brightness > 0.5) {
            color.rgb *= strength;
          }
          
          gl_FragColor = color;
        }
      `
    });
  }
  
  render(input: WebGLRenderTarget, output: WebGLRenderTarget, renderer: WebGLRenderer): void {
    this.material.uniforms.tDiffuse.value = input.texture;
    
    // 渲染
    const quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    
    renderer.setRenderTarget(output);
    renderer.render(quad, camera);
  }
  
  resize(width: number, height: number): void {
    // 调整大小
  }
}
```

### 4.3 使用示例

```typescript
const postProcessing = new PostProcessingPipeline(
  engine.renderer,
  window.innerWidth,
  window.innerHeight
);

// 添加 Bloom
postProcessing.addPass(new BloomPass(0.5, 0.4));

// 添加 FXAA
postProcessing.addPass(new FXAAPass());

// 渲染
engine.on('frame', () => {
  postProcessing.render(engine.scene, engine.camera);
});
```

---

## 5. 日夜交替系统

### 5.1 太阳位置计算

```typescript
class SunPosition {
  // 计算太阳方向
  static calculate(date: Date, latitude: number, longitude: number): Vector3 {
    // 计算儒略日
    const julianDay = this.toJulianDay(date);
    
    // 计算太阳赤经和赤纬
    const { declination, rightAscension } = this.solarCoordinates(julianDay);
    
    // 计算时角
    const hourAngle = this.hourAngle(julianDay, longitude);
    
    // 计算高度角和方位角
    const elevation = Math.asin(
      Math.sin(latitude) * Math.sin(declination) +
      Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)
    );
    
    const azimuth = Math.atan2(
      -Math.sin(hourAngle),
      Math.tan(declination) * Math.cos(latitude) -
      Math.sin(latitude) * Math.cos(hourAngle)
    );
    
    // 转换为方向向量
    return new Vector3(
      Math.cos(elevation) * Math.sin(azimuth),
      Math.sin(elevation),
      Math.cos(elevation) * Math.cos(azimuth)
    ).normalize();
  }
}
```

### 5.2 日夜交替渲染

```typescript
class DayNightSystem {
  private sunLight: DirectionalLight;
  private ambientLight: AmbientLight;
  private sunDirection: Vector3;
  
  // 材质
  private dayMaterial: Material;
  private nightMaterial: Material;
  
  constructor(scene: Scene) {
    // 太阳光
    this.sunLight = new DirectionalLight(0xffffff, 1.0);
    scene.add(this.sunLight);
    
    // 环境光
    this.ambientLight = new AmbientLight(0x404040, 0.3);
    scene.add(this.ambientLight);
  }
  
  update(date: Date, latitude: number, longitude: number): void {
    // 计算太阳位置
    this.sunDirection = SunPosition.calculate(date, latitude, longitude);
    
    // 更新灯光
    this.sunLight.position.copy(this.sunDirection);
    
    // 计算白天/夜晚强度
    const elevation = Math.asin(this.sunDirection.y);
    const dayIntensity = Math.max(0, Math.sin(elevation));
    
    // 调整灯光强度
    this.sunLight.intensity = dayIntensity;
    this.ambientLight.intensity = 0.1 + dayIntensity * 0.2;
    
    // 调整灯光颜色（日出日落偏红）
    if (elevation < 0.2 && elevation > 0) {
      const t = elevation / 0.2;
      this.sunLight.color.setRGB(1, 0.5 + t * 0.5, 0.3 + t * 0.7);
    } else {
      this.sunLight.color.setHex(0xffffff);
    }
  }
  
  // 获取当前时间段
  getTimeOfDay(): 'dawn' | 'day' | 'dusk' | 'night' {
    const elevation = Math.asin(this.sunDirection.y);
    
    if (elevation < -0.1) return 'night';
    if (elevation < 0.1) return this.sunDirection.x > 0 ? 'dawn' : 'dusk';
    return 'day';
  }
}
```

### 5.3 使用示例

```typescript
const dayNight = new DayNightSystem(engine.scene);

// 实时更新
setInterval(() => {
  const date = new Date();
  dayNight.update(date, 39.9085, 116.3975);  // 北京
}, 1000);

// 根据时间段调整渲染
engine.on('frame', () => {
  const timeOfDay = dayNight.getTimeOfDay();
  
  switch (timeOfDay) {
    case 'night':
      // 显示星空
      engine.starfield.visible = true;
      break;
    case 'dawn':
    case 'dusk':
      // 调整大气颜色
      engine.atmosphere.uniforms.sunsetColor.value = new Color('#ff6b35');
      break;
  }
});
```

---

## 6. 云层渲染

### 6.1 云层材质

```typescript
class CloudMaterial extends ShaderMaterial {
  constructor() {
    super({
      uniforms: {
        cloudTexture: { value: null },
        time: { value: 0 },
        cloudSpeed: { value: 0.01 },
        cloudOpacity: { value: 0.8 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D cloudTexture;
        uniform float time;
        uniform float cloudSpeed;
        uniform float cloudOpacity;
        varying vec2 vUv;
        
        void main() {
          // 云层滚动
          vec2 uv = vUv + vec2(time * cloudSpeed, 0.0);
          
          vec4 cloud = texture2D(cloudTexture, uv);
          
          gl_FragColor = vec4(cloud.rgb, cloud.a * cloudOpacity);
        }
      `,
      transparent: true,
      depthWrite: false
    });
  }
  
  update(deltaTime: number): void {
    this.uniforms.time.value += deltaTime;
  }
}
```

### 6.2 云层网格

```typescript
class CloudLayer {
  private mesh: Mesh;
  private material: CloudMaterial;
  
  constructor(radius: number) {
    // 创建云层球面
    const geometry = new SphereGeometry(radius * 1.02, 64, 64);
    
    this.material = new CloudMaterial();
    
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.renderOrder = 100;  // 在地形之上渲染
  }
  
  setCloudTexture(texture: Texture): void {
    this.material.uniforms.cloudTexture.value = texture;
  }
  
  update(deltaTime: number): void {
    this.material.update(deltaTime);
  }
}
```

### 6.3 使用示例

```typescript
const cloudLayer = new CloudLayer(engine.radius);

// 加载云层纹理
const loader = new TextureLoader();
loader.load('/textures/clouds.png', (texture) => {
  cloudLayer.setCloudTexture(texture);
});

engine.scene.add(cloudLayer.mesh);

// 更新
engine.on('frame', ({ deltaTime }) => {
  cloudLayer.update(deltaTime);
});
```

---

## 7. 验收清单

1. [ ] GPU 拾取准确且快速
2. [ ] 手势响应流畅
3. [ ] 后处理效果正常
4. [ ] 日夜交替自然
5. [ ] 云层渲染正确

---

## 8. 参考源码

- `src/core/GPUPicker.ts` - GPU 拾取
- `src/core/GestureController.ts` - 手势处理
- `src/core/PostProcessing.ts` - 后处理
- `src/lighting/DayNightSystem.ts` - 日夜系统
- `src/globe/CloudLayer.ts` - 云层