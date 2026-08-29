# MenuTree Platform

## 目录

- `platform/frontend/src/`：前端源文件（页面模板与平台逻辑）
- `platform/frontend/dist/`：当前单文件构建产物，仅用于预览
- `platform/backend/`：FastAPI、SQLAlchemy 与 Alembic 后端
- `platform/data/`：种子数据与后续导入数据
- `platform/scripts/`：Excel 解析和前端构建脚本
- `platform/tests/`：版本树及前端相关测试
- `platform/deploy/`：Docker Compose 等部署配置
- `docs/`：产品设计和数据模型文档

## 当前运行方式（不使用 API）

```zsh
cd "/Users/eric/Downloads/Cloude/音画menu tree"
python3 -m http.server 4173
```

打开 `http://localhost:4173/platform/frontend/dist/音画MenuTree管理平台.html`。

## 构建本地前端产物

```zsh
cd "/Users/eric/Downloads/Cloude/音画menu tree"
python3 platform/scripts/平台构建脚本.py
```

脚本会从 `platform/data/menu_data.json`、`platform/frontend/src/设置MenuTree_页面模板.html` 和 `platform/frontend/src/设置MenuTree_平台逻辑.js` 构建 `platform/frontend/dist/音画MenuTree管理平台.html`。

## 后端与部署

后端代码和 Docker 配置已经归档，但当前前端尚未接入 API。后续再接入，不影响当前本地平台使用。

从项目根目录启动部署环境：

```zsh
cd "/Users/eric/Downloads/Cloude/音画menu tree"
cp .env.example .env
# 根据实际环境修改 .env 中的密码

docker compose --env-file .env -f platform/deploy/docker-compose.yml up --build
```
