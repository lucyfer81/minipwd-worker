# MiniPWD - Personal Password Manager

[English](#english) | [中文](#中文)

---

## 中文

### 简介

MiniPWD 是一款基于 Cloudflare Workers 和 D1 数据库构建的轻量级个人密码管理器。它提供安全、便捷的密码存储和管理功能，所有数据均经过加密处理。

### 特性

- 🔒 **端到端加密**: 所有密码数据使用独立加密密钥加密存储
- ⚡ **高性能**: 基于 Cloudflare Workers 全球边缘网络，响应快速
- 💾 **D1 数据库**: 使用 Cloudflare D1 数据库安全存储数据
- 🔑 **强密码生成**: 内置密码生成器，支持自定义长度和字符类型
- 🎯 **简洁易用**: 简洁的 Web 界面，支持 CRUD 操作
- 🗂️ **分类与定位**: 支持个人/工作分类、关键词搜索、最近使用排序
- 🛡️ **JWT 认证**: 基于 JWT 的安全认证机制

### 技术栈

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1
- **Language**: TypeScript
- **Authentication**: JWT (JSON Web Token)
- **Encryption**: AES-GCM 256-bit encryption

### 快速开始

#### 前置要求

- Node.js 18+
- npm 或 yarn
- Cloudflare 账号（免费账户即可）

#### 安装

```bash
# 安装依赖
npm install

# 登录 Cloudflare
npx wrangler login
```

#### 配置

1. 创建 D1 数据库：

```bash
npm run db:create
```

2. 初始化数据库表结构：

```bash
# 本地开发环境
npm run db:setup

# 生产环境
npm run db:setup:prod
```

> 已有旧版数据库会在首次访问 `/api/items` 相关接口时自动补齐新字段（`space/tags_json/last_used_at`）。

3. 设置环境密钥：

```bash
# 设置主密码（用于登录）
npx wrangler secret put MASTER_PASSWORD

# 生成并设置加密密钥（用于数据加密，生成后不可修改）
npx wrangler secret put ENCRYPTION_KEY

# 生成并设置 JWT 密钥
npx wrangler secret put JWT_SECRET
```

#### 运行

```bash
# 本地开发
npm run dev

# 部署到 Cloudflare Workers
npm run deploy
```

### API 接口

#### 认证

- `POST /api/auth/login` - 使用主密码登录，获取 JWT token

#### 密码管理

- `GET /api/items` - 获取密码条目摘要列表（支持 `space/q/sort` 参数，不返回明文密码）
- `POST /api/items` - 创建新密码条目
- `GET /api/items/:id` - 获取单个条目详情（返回解密后的密码）
- `PUT /api/items/:id` - 更新密码条目
- `DELETE /api/items/:id` - 删除密码条目
- `POST /api/items/:id/used` - 标记条目为最近使用

#### 工具

- `GET /api/generate-password` - 生成强密码（支持参数：length, uppercase, lowercase, numbers, symbols, excludeSimilar）

### 项目结构

```
minipwd/
├── src/
│   ├── index.ts       # Workers 入口和路由
│   ├── crypto.ts      # 加密/解密功能
│   ├── auth.ts        # JWT 认证
│   ├── db.ts          # 数据库操作
│   ├── password.ts    # 密码生成
│   └── assets/        # 静态资源
├── schema.sql         # 数据库表结构
├── wrangler.toml      # Cloudflare Workers 配置
├── package.json
└── tsconfig.json
```

### 安全说明

- 主密码（MASTER_PASSWORD）仅用于身份验证，可随时修改
- 加密密钥（ENCRYPTION_KEY）用于数据加密，生成后固定，不可修改
- 建议定期更换主密码
- 所有密码在存储前均经过 AES-GCM 256-bit 加密

### 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

### 贡献

欢迎提交 Issue 和 Pull Request！

---

## English

### Overview

MiniPWD is a lightweight personal password manager built on Cloudflare Workers and D1 database. It provides secure and convenient password storage and management with end-to-end encryption for all data.

### Features

- 🔒 **End-to-end Encryption**: All password data is encrypted using a dedicated encryption key
- ⚡ **High Performance**: Powered by Cloudflare Workers global edge network
- 💾 **D1 Database**: Secure data storage with Cloudflare D1
- 🔑 **Password Generator**: Built-in strong password generator with customizable options
- 🎯 **Simple & Clean**: Minimalist web interface with full CRUD operations
- 🗂️ **Classification & Retrieval**: Personal/work spaces, keyword search, and "recently used" sorting
- 🛡️ **JWT Authentication**: Secure JWT-based authentication mechanism

### Tech Stack

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1
- **Language**: TypeScript
- **Authentication**: JWT (JSON Web Token)
- **Encryption**: AES-GCM 256-bit encryption

### Quick Start

#### Prerequisites

- Node.js 18+
- npm or yarn
- Cloudflare account (free tier is sufficient)

#### Installation

```bash
# Install dependencies
npm install

# Login to Cloudflare
npx wrangler login
```

#### Configuration

1. Create D1 database:

```bash
npm run db:create
```

2. Initialize database schema:

```bash
# Local development
npm run db:setup

# Production
npm run db:setup:prod
```

> Existing databases from older versions will be auto-migrated with new columns (`space/tags_json/last_used_at`) on the first `/api/items` request.

3. Set environment secrets:

```bash
# Set master password (for login)
npx wrangler secret put MASTER_PASSWORD

# Generate and set encryption key (for data encryption, cannot be changed later)
npx wrangler secret put ENCRYPTION_KEY

# Generate and set JWT secret
npx wrangler secret put JWT_SECRET
```

#### Running

```bash
# Local development
npm run dev

# Deploy to Cloudflare Workers
npm run deploy
```

### API Endpoints

#### Authentication

- `POST /api/auth/login` - Login with master password to get JWT token

#### Password Management

- `GET /api/items` - Get item summaries (supports `space/q/sort`; no plaintext password in list)
- `POST /api/items` - Create new password item
- `GET /api/items/:id` - Get item detail (includes decrypted password)
- `PUT /api/items/:id` - Update password item
- `DELETE /api/items/:id` - Delete password item
- `POST /api/items/:id/used` - Mark item as recently used

#### Utilities

- `GET /api/generate-password` - Generate strong password (supports: length, uppercase, lowercase, numbers, symbols, excludeSimilar)

### Project Structure

```
minipwd/
├── src/
│   ├── index.ts       # Workers entry point and routing
│   ├── crypto.ts      # Encryption/decryption utilities
│   ├── auth.ts        # JWT authentication
│   ├── db.ts          # Database operations
│   ├── password.ts    # Password generator
│   └── assets/        # Static assets
├── schema.sql         # Database schema
├── wrangler.toml      # Cloudflare Workers config
├── package.json
└── tsconfig.json
```

### Security Notes

- Master password (MASTER_PASSWORD) is only used for authentication and can be changed anytime
- Encryption key (ENCRYPTION_KEY) is used for data encryption and cannot be changed after setup
- Regular master password rotation is recommended
- All passwords are encrypted with AES-GCM 256-bit before storage

### License

MIT License - See [LICENSE](LICENSE) file for details

### Contributing

Issues and Pull Requests are welcome!
