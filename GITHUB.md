# 获取与复用项目

大学猫协一站通采用 MIT 许可证，由复旦大学爱和猫协维护。

仓库：[AutNiHilo-carry/campus-cat-workbench](https://github.com/AutNiHilo-carry/campus-cat-workbench)。可以通过 GitHub 的 Use this template 创建独立项目，也可以 Fork 后参与上游贡献。

```sh
git clone https://github.com/AutNiHilo-carry/campus-cat-workbench.git
cd campus-cat-workbench
npm test
npm start
```

GitHub Actions 在推送和 Pull Request 时运行测试、检查客户端语法、构建容器并校验运行包。上传或克隆代码不会自动部署服务，服务器部署见 [DEPLOYMENT.md](DEPLOYMENT.md)。

实际数据库、照片、协议、备份和密钥应保存在 Git 仓库之外或忽略目录中。请勿将旧站点运行数据加入开源分支。提交代码时保留项目及第三方组件的许可证和版权声明。
