# Auto Chat

一个基于 React 18 构建的现代化 AI 聊天界面平台，旨在提供流畅的对话体验和自动化任务处理能力。

## 核心功能

- **会话管理**：支持创建新对话、加载历史会话以及重置对话状态。
- **丰富的消息交互**：支持实时文本消息发送及附件上传功能。
- **异步任务处理**：采用轮询机制高效处理耗时的 AI 响应任务。
- **文件上传**：集成文件上传接口，为对话提供丰富的上下文支持。
- **构建集成**：支持特定的构建任务提交（如基于 XML 的配置处理）。
- **现代 UI 设计**：使用 CSS Modules 和 Sass 构建的响应式、精美的用户界面。

## 技术栈

- **前端框架**：[React 18](https://reactjs.org/)
- **构建工具**：[Vite](https://vitejs.dev/)
- **编程语言**：[TypeScript](https://www.typescriptlang.org/)
- **样式处理**：Sass & CSS Modules
- **单元测试**：[Vitest](https://vitest.dev/)
- **代码规范**：ESLint & Prettier

## 快速开始

### 环境准备

- Node.js (推荐 v18+)
- pnpm (推荐)

### 安装依赖

```bash
pnpm install
```

### 开发环境

```bash
pnpm dev
```

### 项目构建

```bash
pnpm build
```

### 运行测试

```bash
pnpm test:unit
```

### 代码格式化与校验

```bash
pnpm format
pnpm lint
```

## 项目结构

```text
src/
├── assets/         # 静态资源（图片、全局样式）
├── components/     # 可复用的 React 组件
├── services/       # API 客户端及外部服务集成
├── styles/         # 全局样式及模块化 SCSS
├── types/          # TypeScript 类型定义
└── App.tsx         # 应用主入口
```

## 配置说明

项目通过环境变量进行配置。请参考 `.env.example` 创建 `.env` 文件：

```env
VITE_API_BASE_URL=http://localhost:8000
```