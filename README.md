<div align="center">

# TREK China

**基于 [TREK](https://github.com/liketrek/TREK) 的中国适配版旅行规划器**

自托管 · 实时协作 · 高德地图 · 中文 UI

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL_v3-6B7280?style=flat-square)](LICENSE)
[![Private](https://img.shields.io/badge/repo-private-red?style=flat-square)]()

</div>

---

## 与上游的关系

本项目 **fork 自 [liketrek/TREK](https://github.com/liketrek/TREK)**（Maurice Böhlen, AGPL v3），经过大幅精简和中国适配后作为独立项目维护。**不合并上游 PR**，后续变更自主维护。

原始版权归属见 [NOTICE.md](NOTICE.md)。

### 删除的功能

| 类别 | 删除内容 | 原因 |
|------|----------|------|
| 认证 | OAuth 2.1 / OIDC / Passkey (WebAuthn) | 中国无 SSO 生态 |
| 插件系统 | Plugin 运行时 / SDK / 注册表 | 无第三方插件需求 |
| 图片 | Unsplash 集成 | 海外服务 |
| 航班 | AirTrail 集成 | 海外服务 |
| MCP | OAuth 传输层 / 动态客户端注册 | 改为静态 Token 认证 |
| 遥测 | 分析上报 | 隐私优先 |
| 国际化 | 23 种语言 → 仅简体中文 | 国内使用 |
| CI | GitHub Actions 工作流 | 本地验证为主 |

### 保留的核心功能

- **行程规划**：拖拽排序、日程管理、路线自动规划（高德路线 API）
- **地图**：高德地图底图 + 高德 POI 搜索 + 高德路线规划
- **预订管理**：住宿、交通、16 种预订类型
- **费用分摊**：多币种、结算建议、CSV 导出
- **清单打包**：分类、模板、分组
- **实时协作**：WebSocket 同步、成员管理、权限控制
- **MCP 服务器**：静态 Token 认证，199+ 工具
- **PWA**：离线支持、移动端适配
- **Docker 部署**：基于 `mauriceboe/trek:latest` overlay 构建

### 中国适配

| 特性 | 说明 |
|------|------|
| 高德地图 | 底图、POI 搜索、路线规划（驾驶/步行/骑行） |
| GCJ-02 坐标系 | 正确处理 WGS-84 ↔ GCJ-02 转换，避免偏移 |
| 简体中文 | UI、表单、提示信息全部中文化 |
| 东八区 | 默认 UTC+8 时区 |
| 容器化 | `Dockerfile.china`，overlay 模式构建 |

## 快速开始

```bash
# Docker 单机部署
ENCRYPTION_KEY=$(openssl rand -hex 32) docker run -d -p 3000:3000 \
  -e ENCRYPTION_KEY=$ENCRYPTION_KEY \
  -v ./data:/app/data -v ./uploads:/app/uploads \
  mauriceboe/trek
```

首次启动会创建管理员账号，凭据打印在容器日志中（`docker logs trek`）。

### Docker Compose

```yaml
version: '3.8'
services:
  trek:
    build:
      context: .
      dockerfile: Dockerfile.china
    ports:
      - "33124:3000"
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
    environment:
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    restart: unless-stopped
```

## 技术栈

| 层 | 技术 |
|----|------|
| 后端 | Node.js 22 · NestJS 11 · SQLite (better-sqlite3) |
| 前端 | React 19 · Vite · Zustand · Tailwind CSS |
| 地图 | 高德地图 JS API 2.0 |
| 协作 | WebSocket (ws) |
| 认证 | JWT + 密码登录 |
| AI | MCP 服务器（静态 Token） |
| 部署 | Docker · Docker Compose |

## 开发

```bash
# 安装依赖
npm install

# 构建 shared → server → client
npm run build

# 开发模式（server:3001 + Vite 代理）
npm run dev
```

### 构建 Docker 镜像

```bash
# 本地构建（需要先构建 dist）
npm run build
docker build -t trek-china:latest -f Dockerfile.china .
```

## 与上游的坐标系说明

高德地图使用 **GCJ-02** 坐标系（火星坐标），GPS 设备输出 **WGS-84**。本项目正确处理两者转换：

- **高德 POI 搜索结果**：已是 GCJ-02，直接使用，不重复转换
- **GPS 轨迹数据**：WGS-84 → GCJ-02 后显示
- **路线规划**：高德路线 API 返回 GCJ-02，Polyline 在 RouteCalculator 中转为 WGS-84 存储，渲染时再转回 GCJ-02

## 版权声明

本项目基于 [liketrek/TREK](https://github.com/liketrek/TREK) (AGPL v3) 修改。

**原始版权 © 2024-2026 Maurice Böhlen 及 TREK 贡献者。**

本项目的修改部分遵循 AGPL v3 协议。完整许可证见 [LICENSE](LICENSE)。

### 第三方数据

Atlas 地图的国家/省级边界数据来自 [**geoBoundaries**](https://www.geoboundaries.org/) (Runfola et al., 2020)，采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 授权。详见 [NOTICE.md](NOTICE.md)。

## 许可证

[GNU Affero General Public License v3.0](LICENSE)

你可以自由地：
- ✅ 使用、复制、分发本软件
- ✅ 修改源代码
- ✅ 自托管用于个人或内部公司使用

但如果你修改后作为网络服务提供给第三方：
- 📋 必须将修改后的代码在相同许可证下开源
- 📋 必须保留原始版权声明

---

*基于 [TREK](https://github.com/liketrek/TREK) · 中国适配版*
