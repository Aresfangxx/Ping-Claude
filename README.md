# Claude IP Risk Detector

检测 IP 风险，保障 Claude 账号安全。

## 功能概述

本扩展用于检测当前网络出口 IP 的风险等级，帮助用户了解其 IP 是否可能导致 Claude 账号被封禁。

## 检测维度

### 1. IP 类型识别

**数据来源**：
- [ping0.cc](https://ping0.cc) - IP 归属地与 ASN 信息
- [ip-api.com](http://ip-api.com) - 免费的 IP 地理信息查询
- [ipinfo.io](https://ipinfo.io) - 可选的付费 API（需配置 Key）

**检测内容**：
- 数据中心/IDC IP（AWS、GCP、阿里云等）
- VPN/代理节点
- 住宅宽带 IP

### 2. IP 信誉评估

**数据来源**：
- [IPQualityScore](https://ipqualityscore.com) - IP 风险评分（需配置 Key）
- [Scamalytics](https://scamalytics.com) - IP 欺诈分数（需配置 Key）

**评估内容**：
- 欺诈分数
- 滥用历史记录
- 是否为已知代理/VPN

### 3. 地理跳跃检测

**数据来源**：本地存储的历史检测记录

**检测内容**：
- 短时间内国家/地区切换
- 24小时内切换 → 高风险
- 7天内切换 → 中风险

### 4. 环境一致性校验

**数据来源**：浏览器 JavaScript API

**检测内容**：
- 系统时区 vs IP 归属地
- 浏览器语言设置
- 时区与 IP 地区不匹配时触发警告

### 5. DNS 泄露检测

**数据来源**：公共 DNS API（Cloudflare、Google、Quad9）

**检测内容**：
- 检测当前使用的 DNS 服务器
- DNS 请求是否通过 VPN/代理加密隧道
- 此项不计入风险评分，仅供参考

## 风险等级

| 等级 | 分数范围 | 说明 |
|:---:|:---:|:---|
| ✅ 安全 | 0-25 | 当前 IP 适合使用 Claude |
| ⚠️ 注意 | 26-50 | 存在轻度风险 |
| ⚠️ 警告 | 51-75 | 建议切换节点 |
| ❌ 高危 | 76-100 | 极易触发封号 |

## 安装方式

1. 下载/克隆本项目
2. 打开 Chrome，进入 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择本项目文件夹

## API Key 配置（可选）

扩展默认使用免费 API 工作。如需更精准的检测结果，可以配置以下 API Key：

### ipinfo.io（推荐）
- 注册地址：https://ipinfo.io
- 免费额度：50,000 次/月
- 提供更详细的 ASN 和组织信息

### IPQualityScore
- 注册地址：https://ipqualityscore.com
- 免费额度：5,000 次/月
- 提供欺诈分数和滥用历史

### Scamalytics
- 注册地址：https://scamalytics.com
- 免费额度：5,000 次/月
- 提供独立的 IP 欺诈风险评分

配置方式：扩展弹出窗口 → 填写 Key → 点击「保存 Keys」

## 使用方法

1. 点击扩展图标打开面板
2. （首次）填写并保存 API Keys（可选）
3. 点击「立即检测」开始检测
4. 查看风险评估结果和建议

## 数据隐私

- 所有检测均在本地完成
- API Key 仅保存在本地浏览器存储中
- 不会上传任何用户数据

## 技术栈

- Manifest V3
- Vanilla JavaScript
- Chrome Storage API

## 项目结构

```
├── manifest.json    # 扩展配置文件
├── popup.html      # 主界面
├── popup.js        # 核心检测逻辑
├── background.js   # Service Worker
├── styles.css      # 样式表
└── icons/          # 扩展图标
```

## 免责声明

本工具仅提供 IP 风险参考，不能 100% 准确预测账号安全状况。Claude 封号还可能由其他因素（如内容违规、异常操作行为等）导致。
