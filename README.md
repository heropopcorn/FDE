# 智能审批演示

本地网页演示，覆盖两段能力：

1. 管理员创建账号和审批流程，所有人可以发起、按节点审批。
2. 每个人可以针对某个流程配置自己的自动审批规则。单据到达该节点时，调用 OpenRouter 免费模型判断是否直接通过。

## 启动

```bash
cd approval-demo
npm install
npm run dev
```

浏览器打开 http://localhost:3000 。

密钥放在 `approval-demo/.env.local` 的 `OPENROUTER_API_KEY`，不要提交到仓库。数据库文件是 `approval-demo/data/app.db`。向量由本机的 `bge-large-zh-v1.5` 生成，维度 1024，写入 Redis。第一次运行会把模型下载到 `.cache/transformers`。

```bash
docker compose up -d
```

## 演示账号

| 姓名 | 账号 | 密码 | 说明 |
| --- | --- | --- | --- |
| 系统管理员 | admin | admin123 | 创建账号、配置流程 |
| 张安 | zhangan | 123456 | 请假复审、费用初审。请假天数小于 3 自动通过 |
| 邱剑锋 | qiujianfeng | 123456 | 费用复审、宣发初审 |
| 申佳琪 | shenjiaqi | 123456 | 请假初审、宣发复审 |
| 常嫕 | changyi | 123456 | 请假初审、服务器复审、技术支持初审 |
| 黄尊宣 | huangzunxuan | 123456 | 服务器初审、技术支持复审 |

请假由申佳琪或常嫕初审（一人通过即可），再由张安复审。费用报销由张安初审、邱剑锋复审。
