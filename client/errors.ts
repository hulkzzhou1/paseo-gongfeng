export const errorMessages: Record<string, string> = {
  unconfigured: "请先在工蜂连接设置中配置账号。",
  unauthorized: "Token 无效或已过期，请在工蜂连接设置中更换。",
  forbidden: "当前账号无权访问这些工蜂数据。",
  not_found: "工蜂资源不存在或当前账号无权访问。",
  rate_limited: "工蜂请求已限流，请稍后手动重试。",
  network_error: "无法连接工蜂，请检查 daemon 的内网连接后重试。",
  service_error: "工蜂服务暂时不可用，请稍后重试。",
  invalid_response: "工蜂返回了无法识别的数据，请稍后重试。",
  storage_error: "服务器无法读取已保存的配置，请检查存储权限。",
  host_error: "无法读取 Paseo 项目，请稍后刷新。",
  stale_binding: "仓库关联已变化，正在刷新关联范围。",
  account_changed: "工蜂账号已更换，正在重新读取账号。",
};
