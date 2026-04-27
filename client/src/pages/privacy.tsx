import { SeoHead } from "@/components/seo-head";

export function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-[16px] py-[32px] lg:px-0 lg:py-[56px]">
      <SeoHead
        title="隐私政策"
        description="TimeAmber 的数据收集、Cookie 使用与隐私保护说明。"
        url="/privacy"
      />
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">隐私政策</h1>
      <p className="mt-[4px] mb-[24px] text-[13px] text-muted-foreground/40">
        最后更新：2026-04-22
      </p>

      <div className="prose-timeamber space-y-[24px]">
        <section>
          <h2>数据收集说明</h2>
          <p>TimeAmber 在您访问时，可能会自动收集以下非个人身份信息：</p>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/20">
                <th className="py-[8px] pr-[12px] text-left">数据类型</th>
                <th className="py-[8px] pr-[12px] text-left">来源</th>
                <th className="py-[8px] text-left">用途</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/10">
                <td className="py-[8px] pr-[12px]">访问页面路径</td>
                <td className="py-[8px] pr-[12px]">请求 URL</td>
                <td className="py-[8px]">内容统计</td>
              </tr>
              <tr className="border-b border-border/10">
                <td className="py-[8px] pr-[12px]">访客来源国家</td>
                <td className="py-[8px] pr-[12px]">Cloudflare 请求头</td>
                <td className="py-[8px]">访问分析</td>
              </tr>
              <tr className="border-b border-border/10">
                <td className="py-[8px] pr-[12px]">来源域名</td>
                <td className="py-[8px] pr-[12px]">Referer 请求头</td>
                <td className="py-[8px]">访问分析</td>
              </tr>
              <tr className="border-b border-border/10">
                <td className="py-[8px] pr-[12px]">设备类型</td>
                <td className="py-[8px] pr-[12px]">User-Agent</td>
                <td className="py-[8px]">阅读体验优化</td>
              </tr>
              <tr>
                <td className="py-[8px] pr-[12px]">评论者昵称</td>
                <td className="py-[8px] pr-[12px]">用户主动填写</td>
                <td className="py-[8px]">评论展示</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-[8px] text-[13px] text-muted-foreground/60">
            站点不会公开返回评论者邮箱地址，也不会展示原始 IP 地址；相关去重和安全控制仅基于不可逆处理后的信息完成。
          </p>
        </section>

        <section>
          <h2>Cookie 使用</h2>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/20">
                <th className="py-[8px] pr-[12px] text-left">Cookie</th>
                <th className="py-[8px] pr-[12px] text-left">用途</th>
                <th className="py-[8px] text-left">持续时间</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border/10">
                <td className="py-[8px] pr-[12px]">认证 Token</td>
                <td className="py-[8px] pr-[12px]">管理员登录</td>
                <td className="py-[8px]">7 天</td>
              </tr>
              <tr>
                <td className="py-[8px] pr-[12px]">_gdpr_consent</td>
                <td className="py-[8px] pr-[12px]">记录隐私同意</td>
                <td className="py-[8px]">1 年</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h2>第三方脚本与同意机制</h2>
          <p>
            当站点配置了第三方脚本时，访客会先看到 Cookie 同意横幅。
            在您明确同意之前，这些第三方脚本不会被加载；您也可以在之后撤回同意。
          </p>
        </section>

        <section>
          <h2>数据存储与处理</h2>
          <ul>
            <li>站点主要运行在 Cloudflare 边缘网络上，使用 Workers、D1 和 R2 等服务处理内容与媒体资源。</li>
            <li>评论者邮箱仅用于站点管理与审核，不会在公开页面或公开 API 中展示。</li>
            <li>站点不会出售、出租或主动向第三方共享您的个人数据。</li>
          </ul>
        </section>

        <section>
          <h2>数据删除请求</h2>
          <p>如果您希望删除评论或与您相关的数据，可通过以下方式联系站点管理员：</p>
          <ul>
            <li>
              <a
                href="https://github.com/NextCandy/TimeAmber/issues"
                className="text-foreground/70 underline transition-colors hover:text-foreground"
              >
                GitHub Issues
              </a>
              （公开请求）
            </li>
            <li>
              <a
                href="mailto:955555@gmail.com"
                className="text-foreground/70 underline transition-colors hover:text-foreground"
              >
                955555@gmail.com
              </a>
              （私密联系）
            </li>
          </ul>
          <p className="text-[13px] text-muted-foreground/60">
            一般会在 14 个工作日内处理相关请求。
          </p>
        </section>

        <section>
          <h2>政策更新</h2>
          <p>
            本隐私政策可能会随站点功能与合规要求更新。若发生重要变更，站点会在页面或相关公告中说明。
          </p>
        </section>
      </div>
    </div>
  );
}
