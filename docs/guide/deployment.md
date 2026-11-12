# Web / 管理端部署与回滚

以下是可复用部署教程。当前线上入口为 `/snow` 和 `/snow-admin`；2026-11-12 图片更新的实际结果见[发布记录](../engineering/article-images-20261112.md)。教程命令不意味着已替读者在任意新环境执行。

## 1. 准备环境与变量

使用匹配服务器 OS/架构的 Linux 构建环境、Node 22、pnpm 11.19.0、可达 API、HTTPS 域名和进程管理器。两应用独立部署，后端不随前端打包。真实后端凭证不应进入前端构建环境。

生产构建前配置环境，例如：

```dotenv
NEXT_PUBLIC_WEB_API_BASE_URL=https://lichcarlos.top/snow-api/api/v1
NEXT_PUBLIC_ADMIN_API_BASE_URL=https://lichcarlos.top/snow-api/api/v1
NEXT_PUBLIC_WEB_SITE_ORIGIN=https://lichcarlos.top
NEXT_PUBLIC_WEB_BASE_PATH=/snow
NEXT_PUBLIC_ADMIN_BASE_PATH=/snow-admin
```

换域名时同步替换公开地址、后端可信 Origin 与签名存储入口。basePath 为空表示部署根路径。公开地址和前缀在构建时固化；切换运行时环境无法改旧 bundle，必须重新构建。

## 2. 检查、构建与打包

在独立 clone 内执行：

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test:boundaries
pnpm build:web
pnpm build:admin
# 目标必须是不存在的新目录，以下路径按发布批次替换
pnpm package:web /tmp/linji-release-new/web
pnpm package:admin /tmp/linji-release-new/admin
pnpm release:verify web /tmp/linji-release-new/web
pnpm release:verify admin /tmp/linji-release-new/admin
tar -C /tmp/linji-release-new/web -czf /tmp/linji-web.tar.gz .
tar -C /tmp/linji-release-new/admin -czf /tmp/linji-admin.tar.gz .
sha256sum /tmp/linji-web.tar.gz /tmp/linji-admin.tar.gz
```

build 已生成各自 `.next/release`；`package:*` 可另打包到指定新目录。`release-manifest.json` 包含 Build ID、平台、契约指纹、文件摘要和链接目标。传输/解包必须保留内部相对链接；归档摘要经可信渠道核对，清单不是数字签名。

线上只需要解包后的 standalone 文件与相应 Node，不需要 Git、pnpm、开发依赖、SDK 或源码父目录。不要只上传 `.next/server`，也不要把整台开发机依赖目录上传。

## 3. 候选实例

解包到新的 `/opt/linji/releases/<批次>/web` 和 `admin`。先用备用端口启动，例如 Linux：

```bash
HOSTNAME=127.0.0.1 PORT=14100 node /opt/linji/releases/<批次>/web/start.mjs
# 另一终端
HOSTNAME=127.0.0.1 PORT=14101 node /opt/linji/releases/<批次>/admin/start.mjs
```

核对候选的官网、登录、个人中心/写作和管理端关键路径及静态资源；运行未登录/获授权账号的适用检查，确认没有重定向到 Nginx 默认站。只读 smoke 不会证明真实发布内容和模型链路已通过。

`<批次>` 是占位符，须替换为真实目录名。Next 可能需要写缓存，不能直接照搬 API 的只读文件系统设置。

## 4. 进程管理与 Nginx

systemd 示例（官网，路径和 Node 安装位置按实际环境替换）：

```ini
[Unit]
Description=Linji Web
After=network.target

[Service]
User=linji
WorkingDirectory=/opt/linji/releases/RELEASE/web
Environment=NODE_ENV=production
Environment=HOSTNAME=127.0.0.1
Environment=PORT=13100
ExecStart=/usr/bin/node /opt/linji/releases/RELEASE/web/start.mjs
Restart=on-failure
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
```

admin 使用独立 service、目录与端口 13101。确保运行用户能读取发布包且只能写必要缓存目录。端口只向反向代理开放。

同一 HTTPS server 中的路径示意：

```nginx
location = /snow {
    proxy_pass http://127.0.0.1:13100;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location /snow/ {
    proxy_pass http://127.0.0.1:13100;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
location = /snow-admin {
    proxy_pass http://127.0.0.1:13101;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
}
location /snow-admin/ {
    proxy_pass http://127.0.0.1:13101;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Next 的 basePath 必须保留，因此这两处 proxy_pass 的地址后没有 `/`。是否保留根路径尾斜杠由实际 Next 配置与候选测试决定，避免额外重定向循环。API 的路径剥离、Cookie/CSRF、可信代理和 SSE 见[后端教程](https://github.com/LichCarlos/skiing-backend/blob/main/docs/guide/deployment.md)。

修改配置前备份；运行 `nginx -t` 通过后 reload。已有反向代理正确时无需为了发布代码重写 Nginx。

## 5. 切换与验收

1. 保存旧服务定义、旧发布目录、当前 Build ID 与关键配置摘要。
2. 仅切换本次发布的 web/admin 对应服务到新目录，重载服务定义并启动；检查 active、退出码和重启次数。
3. 通过正式 HTTPS 检查首页、列表、详情、登录退出、个人中心、管理端原生链接、静态资源、授权和 API 错误。
4. AI 改动需额外验证 SSE、取消、历史与引用；写作改动需验证保存与重新进入。测试写入要有隔离数据和清理方案。
5. 保留旧静态资源/发布包与回滚信息，避免尚未刷新的浏览器引用到已消失资源。

官网需核对桌面与手机，管理端以桌面为目标。构建成功、HTTP 200 和视觉截图分别是不同证据。

## 6. 回滚

前端回滚将对应 service 恢复到旧 release 目录并重启，再核对 HTTPS 路由、资源与登录。前端包不执行数据库回滚。若接口已破坏兼容，需与后端协调成套回退；不能只替换前端掩盖契约变化。

当前 2026-11-12 发布的专用回滚入口与旧版本信息记录在图片更新说明中。后续批次应生成自己的发布清单，不复用旧脚本指向新目录。

## 7. 持续运维

监测错误率、关键 API、登录/CSRF、Next 进程内存、磁盘、证书到期与静态资源命中。日志保存在运行环境并脱敏，不提交 Git。GitHub CI 负责检查和构建；当前没有自动生产部署。上线前确认远程 CI 结果，并保留源码提交号、契约 SHA、构建平台和产物摘要。
