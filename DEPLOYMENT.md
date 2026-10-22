# 部署配置与隔离测试参考

> **当前不推荐部署上线，也不推荐引入真实业务数据。** 本文保留部署配置供开发者进行隔离测试和后续完善，不代表当前版本已达到生产使用要求。请使用虚构或充分脱敏资料测试。

当前先将源代码上传 GitHub；上传仓库不会自动发布网站。完整后端需运行 Node.js 服务，GitHub Pages 只能运行静态演示版。

## 本地验证

安装 Node.js 24，执行 `npm test`，然后 `npm start`，访问 http://127.0.0.1:8787/。无需安装 npm 依赖。默认本地模式有示例数据，数据保存在 `data/`。

正式上线前请在目标服务器完成一次容器构建、HTTPS 登录、实际上传照片、备份恢复测试。GitHub Actions 已执行容器构建检查；这不替代目标服务器上的 HTTPS 和公网业务验证。

## 单台服务器配置

服务器安装 Docker Engine 与 Compose 插件，准备一个解析到服务器的域名，按服务商要求处理域名与备案。外网只开放 80/443；应用的 8787 不映射到外网。不要增加多个 app 副本：SQLite 和上传目录由单个进程管理。

```sh
cp .env.example .env
# 编辑 .env，填写 DANMIAO_DOMAIN，例如你自己的 cats.example.org
# 使用本机 Node.js 24 生成初始化口令；没有 Node 可用下面的官方容器：
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work node:24-bookworm-slim node server/ops.cjs setup-token
# Compose 文件型 secret 使用宿主文件权限，确保容器内 node 用户（uid 1000）可读：
sudo chown 1000:1000 secrets/setup-token.txt
sudo chmod 400 secrets/setup-token.txt
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 app proxy
```

在本机安全读取 `secrets/setup-token.txt`，访问 `https://你的域名/`，填写初始化口令并创建管理员。不要将口令发到群聊、GitHub 或截图中。初始生产数据为空。随后通过“管理 → 账号与权限”创建成员账号，不要共享管理员密码。首次初始化后接口会拒绝再次创建初始管理员；初始化文件仍用于配置读取，请妥善保留。

默认配置：HTTPS 来源校验、Secure/HttpOnly/SameSite Cookie、登录限流、请求编号与不含请求正文的日志；SQLite 与附件持久化到 Docker volume。容器使用非 root 用户、只读根目录。`DANMIAO_TRUST_PROXY=1` 只适用于应用仅由可信反向代理访问的网络，不能直接暴露应用端口。

不使用 Compose 时可运行 `node server/index.cjs`，环境变量如下：

| 配置 | 用途 |
| --- | --- |
| `NODE_ENV=production` | 强制 HTTPS 来源和空数据初始化 |
| `DANMIAO_PUBLIC_ORIGIN=https://你的域名` | 完整站点来源，不含路径 |
| `DANMIAO_SETUP_TOKEN_FILE` | 至少32位随机初始化口令的文件路径 |
| `DANMIAO_DATA_DIR` | SQLite 与上传文件的持久目录 |
| `DANMIAO_HOST` / `PORT` | 默认 `127.0.0.1` / `8787` |
| `DANMIAO_SEED=empty` | 新数据库不含示例，生产模式必须为 empty |

仅改变配置不会清空旧数据库。生产环境不要挂载带有测试数据的本地 `data/`。现有静态版浏览器记录也不会自动导入数据库，请先保留原始备份。

## 系统备份与恢复

生产配置默认每24小时在独立工作线程备份；Compose 已将备份目录设置为 `/backups`。管理员可在“管理”查看状态或手动创建服务器备份。自动备份设置、日志和留存边界见 [UPGRADE-NOTES.md](UPGRADE-NOTES.md)。默认不删除旧备份，请管理容量并另存异地副本。

界面 JSON 备份包括业务和附件，保留目标站点原账号。下面的系统备份另外包含账号密码哈希和权限，恢复时清除旧会话，需要重新登录。系统备份是敏感资料，必须保存在非公开位置；不要提交 GitHub。备份失败的目录没有可用的 manifest，不应当当作成功备份。

```sh
# target 每次必须使用一个新目录，示例时间戳会产生唯一目录
docker compose exec -T app node server/ops.cjs backup --target /backups/backup-$(date +%Y%m%d-%H%M%S)
```

备份在 SQLite 一致快照上复制附件并生成 SHA-256 清单；应用不物理删除附件，因此快照期间上传不影响已有附件的复制。请再复制到另一台机器或受控备份存储，单服务器 volume 不是异地备份。

恢复示例（本地 Node.js 24）：

```sh
node server/ops.cjs restore --source /受控位置/backup-时间 --target /新的数据目录
```

恢复先验证清单、文件和数据库完整性，仅写入尚不存在的目录。停止旧服务后，再将 `DANMIAO_DATA_DIR` 或 Compose 的数据挂载切换到新目录并启动，验证登录、记录、照片和协议。不要覆盖运行中的数据库，不要执行 `docker compose down -v`。恢复工具不删除或修改旧数据。

## 更新与回滚

1. 更新前创建系统备份并记录当前 Git 提交、容器镜像标签和挂载位置。
2. 在独立测试环境对备份副本验证新版，执行测试和容器构建；正式更新时将 `DANMIAO_RELEASE` 改为本次唯一版本标签，再运行 `docker compose up -d --build`。
3. 健康检查通过后，验证登录、权限、附件、库存和财务流程。`/api/health` 只反映进程可用与数据库可读，不替代业务验证。
4. 回滚需匹配旧代码、旧镜像和更新前的系统备份。先将备份恢复到新目录，再停服切换；保留失败版本数据，避免丢失更新后的新记录。不能只降级程序后继续写入较新数据库。

当前适用于小规模内部协作，单次上传图片5MB、协议20MB；附件总量默认1GiB，界面 JSON 恢复最多150MB请求。列表已使用服务端分页，但首次仍读取完整业务快照用于关联操作。更大规模需要评估独立数据库/对象存储和压测，再扩容；当前没有邮件找回密码或自动异地备份。

参考：[Node.js SQLite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)、[Docker Compose secrets](https://docs.docker.com/compose/how-tos/use-secrets/)、[Caddy 自动 HTTPS](https://caddyserver.com/docs/automatic-https)。

## 测试 Demo 的上线边界

本项目仍是轻量级测试 Demo，功能及工程化尚不完善，不承诺生产稳定性或数据零丢失。当前不推荐部署上线或引入真实业务数据。请仅使用虚构或充分脱敏资料进行隔离测试；HTTPS、权限、恢复、负载与数据保护仍需进一步验证。账号恢复见 [ACCOUNT-RECOVERY.md](ACCOUNT-RECOVERY.md)，自动化隔离恢复演练及实际环境验证步骤见 [RECOVERY-DRILL.md](RECOVERY-DRILL.md)。
