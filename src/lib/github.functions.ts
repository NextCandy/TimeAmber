import { createServerFn } from "@tanstack/react-start";

export type GithubCommit = {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  authorAvatar?: string;
  date: string;
  url: string;
};

export type GithubStatus = {
  ok: boolean;
  repo: string;
  branch: string;
  defaultBranch?: string;
  htmlUrl?: string;
  pushedAt?: string;
  latestCommit?: GithubCommit;
  recentCommits?: GithubCommit[];
  fetchedAt: string;
  error?: string;
};

function parseRepo(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  // Accept "owner/name" or full URL
  const m = v.match(/^(?:https?:\/\/github\.com\/)?([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/);
  if (!m) return null;
  return `${m[1]}/${m[2]}`;
}

export const getGithubStatus = createServerFn({ method: "GET" })
  .inputValidator((data: { repo: string; branch?: string }) => data)
  .handler(async ({ data }): Promise<GithubStatus> => {
    const repo = parseRepo(data.repo);
    const fetchedAt = new Date().toISOString();
    if (!repo) {
      return {
        ok: false,
        repo: data.repo,
        branch: data.branch || "main",
        fetchedAt,
        error: "仓库格式不正确，请填写 owner/name 或完整 URL",
      };
    }

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "TimeAmber-Lovable",
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    try {
      const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
      if (!repoRes.ok) {
        return {
          ok: false,
          repo,
          branch: data.branch || "main",
          fetchedAt,
          error: `仓库信息获取失败：${repoRes.status} ${repoRes.statusText}`,
        };
      }
      const repoInfo = (await repoRes.json()) as {
        default_branch: string;
        html_url: string;
        pushed_at: string;
      };
      const branch = data.branch?.trim() || repoInfo.default_branch || "main";

      const commitsRes = await fetch(
        `https://api.github.com/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=10`,
        { headers },
      );
      if (!commitsRes.ok) {
        return {
          ok: false,
          repo,
          branch,
          defaultBranch: repoInfo.default_branch,
          htmlUrl: repoInfo.html_url,
          pushedAt: repoInfo.pushed_at,
          fetchedAt,
          error: `提交记录获取失败：${commitsRes.status} ${commitsRes.statusText}`,
        };
      }
      const commits = (await commitsRes.json()) as Array<{
        sha: string;
        html_url: string;
        commit: { message: string; author: { name: string; date: string } };
        author?: { login: string; avatar_url: string } | null;
      }>;

      const mapped: GithubCommit[] = commits.map((c) => ({
        sha: c.sha,
        shortSha: c.sha.slice(0, 7),
        message: c.commit.message.split("\n")[0],
        author: c.author?.login || c.commit.author?.name || "unknown",
        authorAvatar: c.author?.avatar_url,
        date: c.commit.author?.date,
        url: c.html_url,
      }));

      return {
        ok: true,
        repo,
        branch,
        defaultBranch: repoInfo.default_branch,
        htmlUrl: repoInfo.html_url,
        pushedAt: repoInfo.pushed_at,
        latestCommit: mapped[0],
        recentCommits: mapped,
        fetchedAt,
      };
    } catch (e) {
      return {
        ok: false,
        repo,
        branch: data.branch || "main",
        fetchedAt,
        error: e instanceof Error ? e.message : "网络异常",
      };
    }
  });
